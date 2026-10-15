const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {publicAddress,publicJobURL,extractStructuredJob}=require(path.join((process.env.IMPORT_BUILD||path.join(__dirname,'../dist')),'utils/publicJobPage.js'));
test('rejects local, metadata, mapped, multicast and reserved destinations',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(publicAddress(ip),true,ip);
});
test('URL validation blocks alternate local notation, credentials, non-HTTPS and unusual ports',()=>{
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com:444','https://localhost','https://0x7f000001','https://2130706433','https://[::1]']) assert.throws(()=>publicJobURL(url),url);
 assert.equal(publicJobURL('https://example.com/job#section').href,'https://example.com/job');
});
test('extracts structured job facts without executing markup or inventing fields',()=>{
 const job=extractStructuredJob(`<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'JobPosting',title:'Developer',description:'<p>Build accessible React interfaces and Node.js APIs.</p>',hiringOrganization:{name:'Example'},datePosted:'2026-10-15'}]})}</script>`,'https://example.com/jobs/1');
 assert.equal(job.job_title,'Developer');assert.equal(job.employer_name,'Example');assert.equal(job.job_posted_at,'2026-10-15');assert.ok(!job.job_description.includes('<p>'));assert.equal(job.source_url,'https://example.com/jobs/1');assert.throws(()=>extractStructuredJob('<h1>Sign in</h1>','https://example.com'));
});
