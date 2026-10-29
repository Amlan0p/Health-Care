import time, json, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:3055/'
results=[]; logs=[]
def check(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(' :: '+str(extra) if (extra and not cond) else ''))
uniq=str(int(time.time()))
EMAIL=f'e2e{uniq}@example.com'; PW='e2e-password-1'
XSS='<img src=x onerror=window.__xss=1>'
def js(pg,code): return pg.evaluate(code)
def click(pg,sel): pg.evaluate("s=>document.querySelector(s).click()", sel)

with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page()
    pg.on('console', lambda m: logs.append(m.text) if m.type=='error' and 'fonts.g' not in m.text and 'tile.openstreetmap' not in m.text and 'ERR_NAME_NOT_RESOLVED' not in m.text and 'ERR_INTERNET' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR '+str(e)))
    pg.goto(BASE); pg.wait_for_timeout(1500)
    check('home loads, footer reports real API status', 'online' in pg.inner_text('#apiStatus').lower(), pg.inner_text('#apiStatus'))
    check('sample content labelled on news section', 'sample' in pg.inner_text('#sampleNote').lower())
    check('news cards rendered from JSON', pg.locator('.news-card').count()>=4)
    check('no inline event handlers left in markup', pg.evaluate("document.querySelectorAll('[onclick],[onsubmit],[onkeydown]').length")==0)

    # ---- sign up validation + success
    click(pg,'[data-action="go-to-auth"]'); pg.wait_for_timeout(300)
    check('auth modal opens and moves focus inside', pg.evaluate("document.getElementById('authModal').contains(document.activeElement)"))
    click(pg,'#tabSignUp'); pg.wait_for_timeout(100)
    pg.fill('#suFirst','Eve'); pg.fill('#suLast','Tester'); pg.fill('#suEmail',EMAIL); pg.fill('#suPassword','short'); pg.fill('#suConfirm','short')
    pg.click('#suSubmit'); pg.wait_for_timeout(200)
    check('short password rejected client-side', 'at least 8' in pg.inner_text('#suError'))
    pg.fill('#suPassword',PW); pg.fill('#suConfirm','different-pass')
    pg.click('#suSubmit'); pg.wait_for_timeout(200)
    check('password mismatch rejected', 'do not match' in pg.inner_text('#suError'))
    pg.fill('#suConfirm',PW); pg.click('#suSubmit'); pg.wait_for_timeout(2500)
    check('signup lands on dashboard', pg.is_visible('#page-dashboard') and 'Eve' in pg.inner_text('#userBtn'))
    check('empty states shown (not errors)', 'No medications' in pg.inner_text('#medicationsContainer') and 'No appointments' in pg.inner_text('#appointmentsContainer'))
    check('demo banner hidden for real users', not pg.is_visible('#demoBanner'))
    check('JWT stored, no API key anywhere in storage/DOM', pg.evaluate("localStorage.getItem('hc_token')!==null && !/gsk_/.test(document.documentElement.outerHTML+JSON.stringify(localStorage))"))

    # ---- medications (XSS payload must render as text)
    click(pg,'[data-action="open-add-med"]'); pg.wait_for_timeout(200)
    pg.fill('#newMedName',XSS); pg.fill('#newMedTime','Morning <b>bold</b>'); click(pg,'[data-action="confirm-add-med"]'); pg.wait_for_timeout(800)
    check('med saved & XSS payload NOT executed', js(pg,'window.__xss')is None and XSS in pg.inner_text('#medicationsContainer'))
    check('no injected <img>/<b> elements from user text', pg.evaluate("document.querySelectorAll('#medicationsContainer img, #medicationsContainer b').length")==0)
    click(pg,'#medicationsContainer [data-action="cycle-med"]'); pg.wait_for_timeout(600)
    check('med status cycles via backend', 'Taken' in pg.inner_text('#medicationsContainer'))

    # ---- vitals
    click(pg,'[data-action="show-panel"][data-arg="records"]'); pg.wait_for_timeout(300)
    click(pg,'#vitalsGridRecords [data-arg="heartRate"]'); pg.wait_for_timeout(200)
    check('vital input starts EMPTY (no fake default)', pg.input_value('#editVitalInput')=='')
    pg.fill('#editVitalInput','9999'); click(pg,'[data-action="save-vital"]'); pg.wait_for_timeout(500)
    check('implausible vital rejected with message', 'between' in pg.inner_text('#editVitalError'))
    pg.fill('#editVitalInput','72'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
    check('vital saved and shown', '72' in pg.inner_text('#vitalsGridRecords'))

    # ---- appointments
    click(pg,'[data-action="show-panel"][data-arg="home"]'); pg.wait_for_timeout(200)
    click(pg,'[data-action="open-book-appt"]'); pg.wait_for_timeout(900)
    check('doctor list loaded from API with sample notice', pg.locator('.doctor-row').count()==15 and 'fictional' in pg.inner_text('#doctorNotice').lower())
    pg.locator('.doctor-row').first.click(); pg.wait_for_timeout(200)
    check('time slots populated from API', pg.locator('#apptTimeInput option').count()==16)
    pg.fill('#apptDateInput','2020-01-01'); click(pg,'[data-action="confirm-appt"]'); pg.wait_for_timeout(500)
    check('past date rejected by server', 'past' in pg.inner_text('#apptError').lower(), pg.inner_text('#apptError'))
    d=pg.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()+3);return d.toISOString().slice(0,10)})()")
    pg.fill('#apptDateInput',d); click(pg,'[data-action="confirm-appt"]'); pg.wait_for_timeout(800)
    check('appointment saved & listed', 'Dr. Subhash Mondal' in pg.inner_text('#appointmentsContainer'))

    # ---- persistence across reload (session restore)
    pg.reload(); pg.wait_for_timeout(2500)
    check('reload restores session + data from DB', pg.is_visible('#page-dashboard') and 'Subhash' in pg.inner_text('#appointmentsContainer') and XSS in pg.inner_text('#medicationsContainer'))

    # ---- chat via backend proxy
    click(pg,'[data-action="show-panel"][data-arg="ai"]'); pg.wait_for_timeout(300)
    pg.fill('#chatInput','What is dengue?'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    t=pg.inner_text('#chatMessages')
    check('chat reply rendered from backend', 'Mock answer to: What is dengue?' in t)
    check('model HTML is escaped, not executed', js(pg,'window.__xss')is None and pg.evaluate("document.querySelectorAll('#chatMessages img').length")==0)
    check('disclaimer styled', pg.locator('#chatMessages .disclaimer').count()==1)
    pg.fill('#chatInput','I have severe chest pain'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    check('emergency alert with 112 shown', pg.locator('.emergency-alert a[href="tel:112"]').count()>=1)
    click(pg,'[data-action="ask-quick"][data-include-vitals="true"]'); pg.wait_for_timeout(1500)
    check('vitals quick-question works', pg.inner_text('#chatMessages').count('Mock answer')>=3)
    pg.reload(); pg.wait_for_timeout(2500); click(pg,'[data-action="show-panel"][data-arg="ai"]'); pg.wait_for_timeout(300)
    check('chat history restored from server after reload', 'What is dengue?' in pg.inner_text('#chatMessages'))

    # ---- symptom checker
    click(pg,'[data-action="show-panel"][data-arg="symptoms"]'); pg.wait_for_timeout(300)
    check('symptom tags rendered from API as buttons', pg.locator('button.symptom-tag').count()==15)
    pg.locator('button.symptom-tag').nth(0).click(); pg.locator('button.symptom-tag').nth(1).click()
    check('aria-pressed toggles', pg.locator('button.symptom-tag[aria-pressed="true"]').count()==2)
    click(pg,'[data-action="check-symptoms"]'); pg.wait_for_timeout(1500)
    rt=pg.inner_text('#symptomResult')
    check('symptom result shows AI-suggestion label + disclaimer', 'ai suggestion' in rt.lower() and 'not a diagnosis' in rt.lower())
    check('model markup escaped in result', pg.evaluate("document.querySelectorAll('#symptomResult b').length")==0)
    pg.locator('button.symptom-tag').nth(5).click()  # chest pain
    click(pg,'[data-action="check-symptoms"]'); pg.wait_for_timeout(1500)
    check('red-flag symptom → emergency notice', pg.locator('#symptomResult .emergency-alert').count()==1)

    # ---- clear chat
    click(pg,'[data-action="show-panel"][data-arg="ai"]'); click(pg,'[data-action="clear-chat"]'); pg.wait_for_timeout(600)
    check('clear chat removes history', 'What is dengue?' not in pg.inner_text('#chatMessages'))

    # ---- logout revokes token
    tok=pg.evaluate("localStorage.getItem('hc_token')")
    click(pg,'#userBtn'); pg.wait_for_timeout(800)
    check('sign out returns to home & clears token', pg.is_visible('#page-home') and pg.evaluate("localStorage.getItem('hc_token')")is None)
    r=pg.evaluate("async t=>{const r=await fetch('/api/medications',{headers:{Authorization:'Bearer '+t}});return r.status}", tok)
    check('old token is revoked server-side (401)', r==401, r)

    # ---- expired/garbage token on load
    pg.evaluate("localStorage.setItem('hc_token','garbage')"); pg.reload(); pg.wait_for_timeout(1500)
    check('invalid stored token → clean home page, token dropped', pg.is_visible('#page-home') and pg.evaluate("localStorage.getItem('hc_token')")is None)

    # ---- sign in again: data persisted
    click(pg,'[data-action="go-to-auth"]'); pg.wait_for_timeout(300)
    pg.fill('#siEmail',EMAIL.upper()); pg.fill('#siPassword','wrong-password'); pg.click('#siSubmit'); pg.wait_for_timeout(800)
    check('wrong password shows error', 'Invalid email or password' in pg.inner_text('#siError'))
    pg.fill('#siPassword',PW); pg.click('#siSubmit'); pg.wait_for_timeout(2500)
    check('sign in (any email case) shows persisted data', 'Subhash' in pg.inner_text('#appointmentsContainer') and '72' in pg.inner_text('#vitalsGridAI'))

    # ---- mid-session expiry (token revoked elsewhere) → friendly sign-in prompt
    tok2=pg.evaluate("localStorage.getItem('hc_token')")
    pg.evaluate("async t=>fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+t}})", tok2)
    click(pg,'[data-action="show-panel"][data-arg="home"]'); click(pg,'[data-action="open-add-med"]'); pg.fill('#newMedName','X'); pg.fill('#newMedTime','Y'); click(pg,'[data-action="confirm-add-med"]'); pg.wait_for_timeout(1200)
    check('revoked session mid-use → returned to sign-in with message', pg.is_visible('#authModal') and 'expired' in pg.inner_text('#siError').lower())

    # ---- demo mode is read-only
    click(pg,'[data-action="demo-login"]'); pg.wait_for_timeout(2500)
    check('demo shows banner + synthetic data', pg.is_visible('#demoBanner') and 'demo data' in pg.inner_text('#medicationsContainer').lower())
    click(pg,'[data-action="open-add-med"]'); pg.fill('#newMedName','Nope'); pg.fill('#newMedTime','Never'); click(pg,'[data-action="confirm-add-med"]'); pg.wait_for_timeout(800)
    check('demo write blocked with explanation', 'read-only' in pg.inner_text('#addMedError').lower(), pg.inner_text('#addMedError'))
    click(pg,'[data-action="close-add-med"]'); pg.wait_for_timeout(200)
    click(pg,'[data-action="show-panel"][data-arg="ai"]'); pg.fill('#chatInput','hi'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1000)
    check('demo cannot use AI (clear message)', 'demo' in pg.inner_text('#chatMessages').lower().split('hi')[-1] or 'read-only' in pg.inner_text('#chatMessages').lower())
    click(pg,'#userBtn'); pg.wait_for_timeout(600)

    # ---- contact + newsletter
    pg.evaluate("document.getElementById('contact').scrollIntoView()")
    pg.fill('#cfName','Jo'); pg.fill('#cfEmail','jo@example.com'); pg.fill('#cfMessage','Hello there, a real message.'); pg.click('#cfSend'); pg.wait_for_timeout(900)
    check('contact form persists & reports honestly', 'received' in pg.inner_text('#cfStatus').lower())
    pg.fill('#nlEmail','news'+uniq+'@example.com'); pg.click('#nlBtn'); pg.wait_for_timeout(700)
    check('newsletter reports saved', 'saved' in pg.inner_text('#nlNote').lower())
    check('unconfigured social links are disabled, not dead', pg.evaluate("[...document.querySelectorAll('[data-social]')].every(a=>a.getAttribute('aria-disabled')==='true' && !a.hasAttribute('href'))"))

    # ---- keyboard + modal behaviour
    pg.keyboard.press('Tab'); 
    click(pg,'[data-action="go-to-auth"]'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('Escape closes auth modal', not pg.evaluate("document.getElementById('authModal').classList.contains('open')"))
    pg.focus('.btn-signin'); outline=pg.evaluate("getComputedStyle(document.activeElement).outlineStyle+' '+getComputedStyle(document.activeElement).outlineWidth")
    check('visible keyboard focus ring', 'solid' in outline and '0px' not in outline, outline)
    check('legal modal opens with disclaimer', (pg.evaluate("document.querySelector('[data-action=\"open-legal\"][data-arg=\"disclaimer\"]').click()") or True) and (pg.wait_for_timeout(300) or True) and 'not a substitute' in pg.inner_text('#legalBody'))
    ctx.close()

    # ---- reduced motion
    c2=b.new_context(viewport={'width':390,'height':800}, reduced_motion='reduce'); p2=c2.new_page(); p2.goto(BASE); p2.wait_for_timeout(300)
    check('prefers-reduced-motion: headline appears instantly, no particles', 'Healthy Life Starts from Here' in p2.inner_text('#hero-heading') and p2.locator('.particle').count()==0)
    c2.close(); b.close()

print('\nconsole/page errors:', logs if logs else 'none')
bad=[n for n,ok in results if not ok]
print(f'\n{len(results)-len(bad)}/{len(results)} E2E checks passed'); sys.exit(1 if bad else 0)
