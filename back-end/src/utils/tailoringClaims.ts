const common = new Set('the and with from that this your have will must should would could for are was were been into about their they them our you can work working build built develop developed development use using used support supporting experience role job candidate required preferred requirements skills ability strong excellent good knowledge understanding team include including'.split(' '));
const words = (text:string) => new Set((text.toLowerCase().match(/[a-z][a-z0-9.+#-]*/g)||[]).map(word=>word.replace(/s$/,'')));
/** Conservative guard, not proof of factuality. Users must review proposed wording. */
export function unsupportedTailoringClaim(source:string, proposed:string, job:string){
 const evidence=words(source),output=words(proposed);
 for(const word of words(job))if(word.length>3&&!common.has(word)&&!evidence.has(word)&&output.has(word))return true;
 for(const word of ['accessible','accessibility','scalable','secure','production','senior','lead','led','managed','certified','expert','expertise','award','million','billion'])if(output.has(word)&&!evidence.has(word))return true;
 const quantities = new Set(source.match(/\d+(?:[.,]\d+)?%?/g)||[]);
 for(const number of proposed.match(/\d+(?:[.,]\d+)?%?/g)||[])if(!quantities.has(number))return true;
 return false;
}
