type RemoteJob = {id:number;url:string;title:string;company_name:string;description:string;publication_date:string;candidate_required_location:string;job_type?:string};
let cache:{jobs:RemoteJob[];fetched:string;expires:number}|undefined;
let pending:Promise<void>|undefined;let lastAttempt=0;
const text=(value:unknown)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim():'';
export function filterRemoteJobs(jobs:RemoteJob[],query:string,location=''){
 const tokens=query.toLowerCase().split(/\s+/).filter(Boolean);
 return jobs.filter(job=>{const content=`${job.title} ${text(job.description)}`.toLowerCase();const place=job.candidate_required_location?.toLowerCase()||'';return tokens.every(token=>content.includes(token))&&(!location||place.includes(location.toLowerCase())||/worldwide|anywhere/.test(place));}).slice(0,20).map(job=>({job_id:`remotive-${job.id}`,job_title:text(job.title).slice(0,200),employer_name:text(job.company_name).slice(0,200),job_description:text(job.description).slice(0,20000),job_apply_link:job.url,job_posted_at:job.publication_date,job_country:job.candidate_required_location||'Restrictions not specified',job_is_remote:true,job_employment_type:job.job_type||'',description_complete:text(job.description).length<=20000}));
}
export async function searchRemoteJobs(query:string,location:string){
 if(!cache||cache.expires<Date.now()){
  if(!pending){
   if(Date.now()-lastAttempt<60000)throw new Error('Feed temporarily unavailable');
   lastAttempt=Date.now();pending=(async()=>{
    const response=await fetch('https://remotive.com/api/remote-jobs',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'MyNext9to5/1.0'}});
    if(!response.ok||!response.body)throw new Error('Feed unavailable');
    const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();
    try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>8_000_000)throw new Error('Feed too large');chunks.push(item.value);}}finally{await reader.cancel();}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(data.jobs))throw new Error('Invalid feed');
    const jobs=data.jobs.filter((job:RemoteJob)=>{try{const url=new URL(job.url);return url.protocol==='https:'&&['remotive.com','www.remotive.com'].includes(url.hostname)&&typeof job.title==='string'&&typeof job.description==='string';}catch{return false;}});
    cache={jobs,fetched:new Date().toISOString(),expires:Date.now()+6*60*60*1000};
   })().finally(()=>{pending=undefined;});
  }
  await pending;
 }
 return {status:'OK',data:filterRemoteJobs(cache!.jobs,query,location),source:'Remotive',source_url:'https://remotive.com',fetched_at:cache!.fetched,feed_notice:'Remotive public listings are delayed by 24 hours. Check the posting for location restrictions and current availability.'};
}
