import { writeFile, mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { store } from './models.mjs';
import { projectState, crashFacts, crashApplication, validateAutoSubtitleReport } from './diagnostics-contract.mjs';
const endpoint='https://crash.dustwave.xyz/v1/auto-subtitle/reports';
async function boundedFile(file, maximum) {
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const info=await handle.stat();
    if(!info.isFile()||info.size>maximum)throw new Error('Choose a regular diagnostic file within the size limit.');
    const buffer=Buffer.alloc(maximum+1);let count=0;
    while(count<buffer.length) {const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
    if(count>maximum)throw new Error('Diagnostic file is too large.');
    return buffer.subarray(0,count);
  }finally{await handle.close();}
}
export async function prepareDiagnostic(file,incident) {
  const bytes=await boundedFile(file,32768);
  const input=JSON.parse(bytes);
  const kind=input.state?.status==='failed'?'workflow_failure':input.state?.status==='interrupted'?'interrupted_job':'current_state';
  const report=projectState(input,randomUUID(),kind);
  if(incident) {
    if(path.extname(incident).toLowerCase()!=='.ips')throw new Error('Choose this app’s macOS .ips crash report (up to 2 MB).');
    const raw=(await boundedFile(incident,2*1024*1024)).toString('utf8'),newline=raw.indexOf('\n');
    const header=JSON.parse(raw.slice(0,newline)),body=JSON.parse(raw.slice(newline+1));
    report.kind='native_crash';report.state.errorCode='NATIVE_CRASH';report.crash=crashFacts(header,body);
    report.application=crashApplication(header,body,report.id);
  }
  validateAutoSubtitleReport(report);
  const directory=path.join(store,'Diagnostics');await mkdir(directory,{recursive:true,mode:0o700});
  const output=path.join(directory,report.id+'.json'),preview=JSON.stringify(report,null,2);
  await writeFile(output,preview,{flag:'wx',mode:0o600});
  return {type:'diagnostic',output,preview,canSend:true};
}
export async function sendDiagnostic(file,{fetcher=fetch}={}) {
  const raw=await boundedFile(file,4096);
  const report=validateAutoSubtitleReport(JSON.parse(raw));
  const response=await fetcher(endpoint,{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json','Origin':'https://crash.dustwave.xyz'},body:JSON.stringify(report),signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.body)throw new Error('Report delivery was not confirmed. Keep this report and retry later.');
  let text='',count=0;
  for await(const bytes of response.body){count+=bytes.length;if(count>4096)throw new Error('Invalid reporting receipt.');text+=new TextDecoder().decode(bytes);}
  const receipt=JSON.parse(text);
  if(receipt.ok!==true||receipt.reportId!==report.id||!Number.isSafeInteger(receipt.issueNumber)||receipt.issueNumber<1||!['created','updated','duplicate'].includes(receipt.action))throw new Error('Invalid reporting receipt.');
  return {type:'report-receipt',issueURL:`https://github.com/aindaco1/auto-subtitle/issues/${receipt.issueNumber}`,summary:receipt.action==='created'?'GitHub issue created.':receipt.action==='duplicate'?'This report was already accepted; it was not counted again.':'Report added to the matching GitHub issue.'};
}
