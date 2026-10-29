// Minimal Groq-compatible mock for E2E tests only. NOT used by the application.
const http=require('http');
http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{
  const j=JSON.parse(b||'{}'); const last=(j.messages||[]).slice(-1)[0]?.content||'';
  let content='Mock answer to: '+last.slice(0,60)+'\n\n- **point one**\n- point two\n\n<img src=x onerror=window.__xss=1>\n\nAlways consult a qualified doctor before taking any medication.';
  if(/symptoms:/i.test(last)) content='{"mostLikely":{"name":"Viral fever <b>x</b>","severity":"medium","advice":"Rest and fluids."},"alsoConsider":["Flu"],"warning":""}';
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content}}]}));});}).listen(3077,'127.0.0.1');
