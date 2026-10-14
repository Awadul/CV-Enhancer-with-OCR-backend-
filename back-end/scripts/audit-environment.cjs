const fs = require('node:fs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const frontend = dotenv.parse(fs.readFileSync(root+'/CV-Enhancer-with-OCR-frontend/front-end/.env'));
const backend = dotenv.parse(fs.readFileSync(root+'/CV-Enhancer-with-OCR-backend-/back-end/.env'));
const fingerprint = value => value ? crypto.createHash('sha256').update(value).digest('hex').slice(0,12) : null;
function jwtInfo(value) { try { const data=JSON.parse(Buffer.from(value.split('.')[1],'base64url')); return {role:data.role || null,refFingerprint:fingerprint(data.ref),expired:typeof data.exp==='number'?data.exp*1000<Date.now():null}; }catch{return null;} }
const urlInfo = value => {try {const u=new URL(value);return {origin:u.origin,hostname:u.hostname};}catch{return null;}};
const frontendUrl=urlInfo(frontend.VITE_SUPABASE_URL),backendUrl=urlInfo(backend.SUPABASE_URL);
const output = {
 frontendVariableNames:Object.keys(frontend).sort(),backendVariableNames:Object.keys(backend).sort(),
 supabase:{frontendConfigured:!!frontendUrl,backendConfigured:!!backendUrl,sameProject:!!frontendUrl&&frontendUrl.origin===backendUrl?.origin,frontendProjectFingerprint:fingerprint(frontendUrl?.hostname),backendProjectFingerprint:fingerprint(backendUrl?.hostname),frontendKey:jwtInfo(frontend.VITE_SUPABASE_ANON_KEY||''),backendKey:jwtInfo(backend.SUPABASE_SERVICE_ROLE_KEY||'')},
 browserHasServerNamedSecrets:Object.keys(frontend).filter(k=>/^VITE_/.test(k)&&/SERVICE_ROLE|SECRET_KEY|OPENAI_API_KEY|DATABASE_PASSWORD/.test(k)),
 frontendApiOrigin:urlInfo(frontend.VITE_API_BASE_URL)?.origin||null,
 backendCapabilities:Object.fromEntries(['OPENAI_API_KEY','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','ADZUNA_APP_ID','ADZUNA_APP_KEY'].map(k=>[k,!!backend[k]])),
 stripeMode:backend.STRIPE_SECRET_KEY?.startsWith('sk_test_')?'test':backend.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':'unclassified',
 explicitlyNamedStagingKeys:[...Object.keys(frontend),...Object.keys(backend)].filter(k=>/STAGING/.test(k)),
};
async function main() {
 if (process.argv.includes('--remote')) {
  const fetchBounded = async (url,headers={}) => {
   const response=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
   const text=await response.text();
   if(text.length>4000000)throw new Error('Response exceeds audit limit');
   return {status:response.status,text};
  };
  if(backendUrl?.hostname.endsWith('.supabase.co')&&backend.SUPABASE_SERVICE_ROLE_KEY) {
   try {
    const result=await fetchBounded(backendUrl.origin+'/rest/v1/',{apikey:backend.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+backend.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/openapi+json'});
    const schema=result.status===200?JSON.parse(result.text):{};
    output.remoteSchema={status:result.status,tables:Object.fromEntries(['saved_cvs','cv_versions','user_subscriptions','user_usage','ai_feature_usage'].map(table=>[table,{present:!!schema.paths?.['/'+table],columns:Object.keys(schema.definitions?.[table]?.properties||{})}])),quotaFunctionPresent:!!schema.paths?.['/rpc/reserve_ai_feature_usage']};
   } catch(error) {output.remoteSchema={errorType:error.name};}
  }
  try {
   const live=await fetchBounded('https://mynext9to5.com');
   const assets=[...new Set([...live.text.matchAll(/(?:src|href)=["']([^"']+\.js)["']/g)].map(match=>new URL(match[1],'https://mynext9to5.com').href))].filter(url=>new URL(url).hostname==='mynext9to5.com').slice(0,5);
   const texts=await Promise.all(assets.map(async url=>{try{return(await fetchBounded(url)).text;}catch{return '';}}));
   const all=texts.join('\n');
   const origins=[...new Set(all.match(/https:\/\/[a-z0-9-]+\.supabase\.co/g)||[])];
   output.liveDeployment={status:live.status,assetsInspected:assets.length,supabaseProjectFingerprints:origins.map(url=>fingerprint(new URL(url).hostname)),matchesLocalSupabase:origins.includes(frontendUrl?.origin),publicApiOrigins:[...new Set(all.match(/https:\/\/[a-z0-9.-]+(?:\.onrender\.com|\.up\.railway\.app|\.mynext9to5\.com)/g)||[])],containsLocalApiOrigin:!!output.frontendApiOrigin&&all.includes(output.frontendApiOrigin)};
  } catch(error) {output.liveDeployment={errorType:error.name};}
 }
 fs.mkdirSync(root+'/verification',{recursive:true});
 fs.writeFileSync(root+'/verification/environment-audit.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
}
main().catch(error=>{console.error('Environment audit failed:',error.name);process.exitCode=1;});
