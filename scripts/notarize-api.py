# /// script
# requires-python = ">=3.11"
# dependencies = ["boto3==1.43.89", "PyJWT==2.13.0", "cryptography==50.0.1"]
# ///
"""Apple's documented Notary API upload; credentials stay in process memory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
import jwt

ROOT = Path(__file__).resolve().parent.parent
AUTH = Path(os.environ.get('AUTO_SUBTITLE_APPLE_AUTH', str(ROOT.parent / 'Apple Auth')))
BASE = 'https://appstoreconnect.apple.com/notary/v2/submissions'

def api(path='', body=None):
    keys = list(AUTH.glob('AuthKey_*.p8'))
    assert len(keys) == 1, 'Choose one Apple API key.'
    now = int(time.time())
    token = jwt.encode({'iss': (AUTH / 'apple-api-issuer.txt').read_text().strip(),
                        'iat': now, 'exp': now + 600, 'aud': 'appstoreconnect-v1'},
                       keys[0].read_bytes(), algorithm='ES256',
                       headers={'kid': keys[0].stem.removeprefix('AuthKey_'), 'typ': 'JWT'})
    request = Request(BASE + path, data=json.dumps(body).encode() if body else None,
                      headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=60) as response:
        return json.load(response)

def notarize(artifact, receipt):
    with artifact.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    pending = receipt.with_suffix('.pending.json')
    previous = json.loads(pending.read_text()) if pending.exists() else {}
    if previous.get('sha256') == digest and previous.get('uploaded'):
        identifier = previous['id']
        print(f'Resuming notarization: {identifier}', flush=True)
    else:
        submission = api(body={'submissionName': artifact.name, 'sha256': digest})['data']
        identifier = submission['id']
        record = {'id': identifier, 'sha256': digest, 'uploaded': False}
        pending.write_text(json.dumps(record, indent=2) + '\n')
        print(f'Notarization submission: {identifier}', flush=True)
        credentials = submission['attributes']
        client = boto3.client('s3', region_name='us-west-2',
            aws_access_key_id=credentials['awsAccessKeyId'],
            aws_secret_access_key=credentials['awsSecretAccessKey'],
            aws_session_token=credentials['awsSessionToken'],
            config=Config(s3={'use_accelerate_endpoint': True}, connect_timeout=60,
                          read_timeout=300, retries={'mode': 'standard', 'max_attempts': 5}))
        client.upload_file(str(artifact), credentials['bucket'], credentials['object'],
            Config=TransferConfig(multipart_chunksize=8 * 1024 * 1024, max_concurrency=2))
        record['uploaded'] = True
        pending.write_text(json.dumps(record, indent=2) + '\n')
        print('Upload complete; waiting for Apple.', flush=True)
    for _ in range(180):
        result = api('/' + identifier)['data']
        status = result['attributes']['status']
        if status != 'In Progress':
            log_url = api('/' + identifier + '/logs')['data']['attributes']['developerLogUrl']
            with urlopen(log_url, timeout=60) as response:
                log = json.load(response)
            evidence = ROOT / 'artifacts/releases/notarization'
            evidence.mkdir(parents=True, exist_ok=True)
            (evidence / (identifier + '.json')).write_text(json.dumps(log, indent=2) + '\n')
            if status != 'Accepted':
                raise RuntimeError('Apple did not accept the submission; inspect private notarization evidence.')
            receipt.write_text(json.dumps({'id': identifier, 'status': status,
                'name': artifact.name, 'sha256': digest,
                'createdDate': result['attributes'].get('createdDate')}, indent=2) + '\n')
            pending.unlink()
            print(f'Apple accepted {artifact.name}; warnings: {len(log.get("issues") or [])}', flush=True)
            return
        time.sleep(10)
    raise TimeoutError('Submission remains pending; resume with the same artifact and receipt.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact', nargs='?', type=Path)
    parser.add_argument('receipt', nargs='?', type=Path)
    parser.add_argument('--history', action='store_true')
    args = parser.parse_args()
    try:
        if args.history:
            for entry in api()['data'][:8]:
                print(json.dumps({'id': entry['id'], **entry['attributes']}))
        else:
            assert args.artifact and args.receipt
            notarize(args.artifact.resolve(), args.receipt.resolve())
    except Exception as error:
        # SDK exceptions can contain temporary credentials or signed URLs.
        print(f'Notarization stopped ({type(error).__name__}); inspect saved submission status before retrying.', file=sys.stderr)
        sys.exit(1)
