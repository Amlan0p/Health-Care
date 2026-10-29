import sys, json
from playwright.sync_api import sync_playwright
BASE='http://localhost:3055/'
VIEWPORTS=[(320,640),(360,740),(375,667),(390,844),(414,896),(768,1024),(820,1180),(1024,768),(1440,900),(667,375),(844,390)]
JS_OVER='''() => {
  const vw = document.documentElement.clientWidth, out=[];
  for (const el of document.querySelectorAll('body *')) {
    const cs=getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden') continue;
    const r=el.getBoundingClientRect(); if (r.width===0) continue;
    // ignore elements clipped by an ancestor with overflow hidden/auto/scroll/clip
    let p=el.parentElement, clipped=false;
    while(p && p!==document.body){ const o=getComputedStyle(p); if(/(hidden|auto|scroll|clip)/.test(o.overflowX)){const pr=p.getBoundingClientRect(); if(pr.right<=vw+1 && pr.left>=-1){clipped=true;break;}} p=p.parentElement;}
    if (!clipped && (r.right>vw+1 || r.left<-1)) out.push((el.id?'#'+el.id:'')+'.'+String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className).split(' ').join('.')+' '+el.tagName+' L'+Math.round(r.left)+' R'+Math.round(r.right));
  }
  return {vw, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, offenders: out.slice(0,8)};
}'''
mode=sys.argv[1] if len(sys.argv)>1 else 'home'
with sync_playwright() as p:
    b=p.chromium.launch()
    errs=[]
    for (w,h) in VIEWPORTS:
        ctx=b.new_context(viewport={'width':w,'height':h}, has_touch=w<900, is_mobile=w<900, device_scale_factor=1)
        pg=ctx.new_page()
        pg.on('console', lambda m: errs.append((w,m.type,m.text[:160])) if m.type in('error','warning') else None)
        pg.on('pageerror', lambda e: errs.append((w,'pageerror',str(e)[:200])))
        pg.on('requestfailed', lambda r: errs.append((w,'reqfailed',r.url[:100])))
        pg.goto(BASE); pg.wait_for_timeout(1200)
        if mode=='home':
            for y in range(0, 6000, 700): pg.evaluate(f'window.scrollTo(0,{y})'); pg.wait_for_timeout(60)
            r=pg.evaluate(JS_OVER)
            print(f'HOME {w}x{h}: scrollW={r["scrollW"]} vw={r["vw"]}', 'OK' if r['scrollW']<=r['vw']+1 and not r['offenders'] else 'OVERFLOW', r['offenders'] if r['offenders'] else '')
        else:
            pg.click('#authModal ~ * >> nth=0') if False else None
            pg.evaluate("document.querySelector('[data-action=\"go-to-auth\"]').click()"); pg.wait_for_timeout(300)
            pg.evaluate("document.querySelector('[data-action=\"demo-login\"]').click()"); pg.wait_for_timeout(2500)
            for panel in ['home','ai','symptoms','hospitals','sos','records']:
                pg.evaluate(f"document.querySelector('.dash-nav-tabs button[data-arg=\"{panel}\"]').click()"); pg.wait_for_timeout(400)
                r=pg.evaluate(JS_OVER)
                print(f'DASH/{panel} {w}x{h}: scrollW={r["scrollW"]} vw={r["vw"]}', 'OK' if r['scrollW']<=r['vw']+1 and not r['offenders'] else 'OVERFLOW', r['offenders'] if r['offenders'] else '')
        ctx.close()
    b.close()
    seen=set()
    for e in errs:
        k=(e[1],e[2])
        if k in seen: continue
        seen.add(k); print('LOG',e)
