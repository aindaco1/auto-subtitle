"""Speech-activity synchronization. No model, transcript or language is required.

FFsubsync owns FFT correlation; this adapter supplies masked media samples,
explicit rate candidates and independent local validation. Seconds stay on the
original media timeline. Unknown (unsampled) reference values are exactly .5,
which FFsubsync transforms to zero weight.
"""
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import webrtcvad
from ffsubsync.aligners import FFTAligner

RATE = 100
WINDOW = 45


def emit(**value):
    print(json.dumps(value), flush=True)


def activity(request, start, duration):
    args = [request['ffmpeg'], '-hide_banner', '-loglevel', 'error', '-nostdin',
            '-ss', str(start), '-i', request['video'], '-t', str(duration),
            '-map', f"0:{request['stream']}", '-vn', '-af',
            'aresample=16000:async=1:first_pts=0', '-ac', '1', '-ar', '16000',
            '-f', 's16le', 'pipe:1']
    audio = subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    detector = webrtcvad.Vad(2)
    return np.array([float(detector.is_speech(audio[i:i+320], 16000))
                     for i in range(0, len(audio)-319, 320)])


def subtitle_signal(cues, size, scale=1., offset=0.):
    result = np.zeros(size)
    for c in cues:
        start = max(0, round((c['start']/1000*scale+offset)*RATE))
        end = min(size, round((c['end']/1000*scale+offset)*RATE))
        if end > start:
            result[start:end] = 1
    return result


def correlation(a, b):
    known = a != .5
    a, b = a[known], b[known]
    if len(a) < 500 or np.std(a) < .08 or np.std(b) < .08:
        return -1.
    return float(np.corrcoef(a, b)[0, 1])


def candidates(cues, ref, duration):
    rates = [24000/1001, 24., 25., 30000/1001, 30.]
    scales = sorted({1., *(round(a/b, 9) for a in rates for b in rates)})
    found = []
    for scale in scales:
        size = max(len(ref), math.ceil(max(c['end'] for c in cues)/1000*scale*RATE)+1)
        signal = subtitle_signal(cues, size, scale)
        offset = FFTAligner(max_offset_samples=300*RATE).fit(ref, signal).transform()/RATE
        score = correlation(ref, subtitle_signal(cues, len(ref), scale, offset))
        found.append(dict(scale=scale, offset=offset, score=score))
    # Prefer identity/rate=1 when score differences are negligible.
    found.append(dict(scale=1., offset=0., score=correlation(ref, subtitle_signal(cues, len(ref)))))
    found.sort(key=lambda v: v['score'] - (0 if v['scale']==1 else .012) - (0 if v['offset']==0 else .002), reverse=True)
    identity=next(c for c in found if c['scale']==1 and c['offset']==0)
    if found[0]['scale']==1 and abs(found[0]['offset'])<=.1 and identity['score']>=found[0]['score']-.02:
        found.remove(identity)
        found.insert(0,identity)
    return found


def validate(cues, ref, transform, windows):
    signal = subtitle_signal(cues, len(ref), transform['scale'], transform['offset'])
    checks = []
    for start, end in windows:
        lo, hi = int(start*RATE), min(len(ref), int(end*RATE))
        a, b = ref[lo:hi], signal[lo:hi]
        if len(a)<500 or np.mean(a[a!=.5])<.05 or np.mean(b)<.03:
            continue
        residual = FFTAligner(max_offset_samples=8*RATE).fit(a, b).transform()/RATE
        best = correlation(a, subtitle_signal(cues, len(ref), transform['scale'], transform['offset']+residual)[lo:hi])
        checks.append(dict(at=(start+end)/2, residual=residual, correlation=correlation(a,b), bestCorrelation=best))
    return checks


def solve(cues, ref, windows, duration):
    # Alternating regions are held out from initial candidate selection.
    train=ref.copy()
    for start,end in windows[1::2]: train[int(start*RATE):int(end*RATE)] = .5
    options = candidates(cues, train, duration)
    best=options[0]
    checks=validate(cues,ref,best,windows)
    reliable=[c for c in checks if c['bestCorrelation']>=.18]
    if len(reliable)>=4:
        # Fit remaining continuous drift with local anchors, then revalidate.
        x=np.array([c['at'] for c in reliable]); y=np.array([c['residual'] for c in reliable])
        slope,intercept=np.polyfit(x,y,1)
        if abs(slope)<.005:
            refined=dict(scale=best['scale']*(1+slope),offset=best['offset']*(1+slope)+intercept,score=best['score'])
            updated=validate(cues,ref,refined,windows)
            if updated and np.median([abs(c['residual']) for c in updated])+.05 < np.median([abs(c['residual']) for c in checks]):
                best,checks=refined,updated
    good=[c for c in checks if c['correlation']>=.18 and abs(c['residual'])<=.45]
    coverage=len(good)/max(1,len(windows))
    regions={min(2,int(c['at']/duration*3)) for c in good}
    holdout=sum(c in good for c in checks[1::2])
    alternative=next((c for c in options[1:] if abs(c['offset']-best['offset'])>1 or abs(c['scale']-best['scale'])*duration>2),None)
    margin=best['score']-(alternative['score'] if alternative else -1)
    accepted=coverage>=.7 and len(regions)==3 and holdout>=2 and margin>=.025
    bounds=all(c['start']/1000*best['scale']+best['offset']>=-.1 and c['end']/1000*best['scale']+best['offset']<=duration+.1 for c in cues)
    return dict(transform=best, checks=checks, accepted=bool(accepted and bounds), coverage=coverage, margin=margin, bounds=bounds)


def supported_pieces(checks, duration):
    anchors=[c for c in checks if c['bestCorrelation']>=.25]
    pieces=[]
    for a,b in zip(anchors,anchors[1:]):
        if abs(a['residual']-b['residual'])<=.35 and b['at']-a['at']<=duration/4:
            pieces.append(dict(start=a['at']-30,end=b['at']+30,offset=(a['residual']+b['residual'])/2))
    return pieces


def run(request):
    duration=request['durationMs']/1000
    cues=request['cues']
    if duration>86400: raise ValueError('Videos longer than 24 hours are not supported.')
    ref=np.full(math.ceil(duration*RATE),.5)
    span=min(WINDOW,max(10,duration/8))
    starts=np.linspace(0,max(0,duration-span),8)
    windows=[(float(s),min(duration,float(s)+span)) for s in starts]
    cache=Path(request['cache'])
    if cache.exists():
        saved=np.load(cache,allow_pickle=False)
        if len(saved)==len(ref): ref=saved
    for i,(start,end) in enumerate(windows):
        lo,hi=int(start*RATE),min(len(ref),int(end*RATE))
        if np.any(ref[lo:hi]==.5):
            data=activity(request,start,end-start)
            ref[lo:min(lo+len(data),len(ref))]=data[:len(ref)-lo]
        emit(type='progress',stage='Checking timing',fraction=(i+1)/10)
    result=solve(cues,ref,windows,duration)
    np.save(cache,ref,allow_pickle=False)
    result['scan']='sampled'
    if not result['accepted']:
        emit(type='progress',stage='Checking detailed speech activity',fraction=None)
        # No neural transcription is needed for this broader, language-neutral reference.
        ref=activity(request,0,duration)
        ref=np.pad(ref,(0,max(0,math.ceil(duration*RATE)-len(ref))),constant_values=.5)
        np.save(cache,ref,allow_pickle=False)
        windows=[(float(s),min(duration,float(s)+min(90,duration/6))) for s in np.linspace(0,max(0,duration-min(90,duration/6)),12)]
        result=solve(cues,ref,windows,duration)
        result['scan']='full-activity'
        # Step changes require independently supported neighboring anchors.
        if not result['accepted']:
            result['pieces']=supported_pieces(result['checks'],duration)
    result.update(type='result',engine='ffsubsync-0.4.29',activityLanguageIndependent=True)
    emit(**result)


if __name__=='__main__':
    try:
        run(json.loads(Path(sys.argv[1]).read_text()))
    except Exception as error:
        print(f'Timing analysis failed: {error}',file=sys.stderr)
        sys.exit(1)
