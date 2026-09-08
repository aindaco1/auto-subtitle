import { run, binary } from './process.mjs';
export async function probe(video) {
  const info=JSON.parse(await run(binary('ffprobe'),['-v','error','-show_format','-show_streams','-of','json',video]));
  const durationMs=Math.round(Number(info.format?.duration)*1000);
  if(!Number.isSafeInteger(durationMs)||durationMs<=0||durationMs>86400000) throw new Error('The video needs a readable duration of less than 24 hours.');
  const audio=info.streams.filter(s=>s.codec_type==='audio').map(s=>({index:s.index,language:s.tags?.language??'und',title:s.tags?.title??'',channels:s.channels,codec:s.codec_name,startMs:Math.round(Number(s.start_time??0)*1000)}));
  if(!audio.length)throw new Error('This file contains no audio track.');
  const videoStream=info.streams.find(s=>s.codec_type==='video');
  const [n,d]=(videoStream?.avg_frame_rate??'0/1').split('/').map(Number);
  return {durationMs,audio,fps:d?n/d:0};
}
export async function extract(video,stream,startMs,durationMs,output) {
  await run(binary('ffmpeg'),['-hide_banner','-loglevel','error','-nostdin','-ss',String(startMs/1000),'-i',video,'-t',String(durationMs/1000),'-map',`0:${stream}`,'-vn','-af','aresample=16000:async=1:first_pts=0','-ac','1','-ar','16000','-c:a','pcm_s16le','-n',output]);
}
