from playwright.sync_api import sync_playwright
B='http://localhost:8799'
errors=[]; ok=lambda label, cond: print(('PASS ' if cond else 'FAIL ')+label) 
with sync_playwright() as p:
    br=p.chromium.launch()
    pg=br.new_page(viewport={'width':1300,'height':900})
    pg.on('pageerror', lambda e: errors.append('PAGEERROR '+str(e)))
    pg.on('console', lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' and 'favicon' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(B+'/admin/'); pg.fill('#e','owner@test.dev'); pg.fill('#p','wrong'); pg.click('button.btn')
    pg.wait_for_selector('#err:not(:empty)'); ok('wrong password rejected', 'Wrong' in pg.inner_text('#err'))
    pg.fill('#p','e2e-password'); pg.click('button.btn'); pg.wait_for_selector('text=Launch checklist'); ok('login works', True)
    pg.click('#seed'); pg.wait_for_selector('text=Starter data imported', timeout=20000); ok('starter data imported', True)
    pub=br.new_page(); pub.goto(B+'/coupons/nike/'); ok('public Nike page exists', 'Nike' in pub.title())
    # edit existing store
    pg.click('a[data-v="c:stores"]'); pg.wait_for_selector('#rows tr[data-id="nike"]')
    pg.click('#rows tr[data-id="nike"] [data-e]'); pg.wait_for_selector('#form')
    marker='LIVE-EDIT-MARKER from the CMS'
    pg.fill('[data-fk="description"] .ctl', marker)
    pg.click('#form button[type=submit]'); pg.wait_for_selector('#rows')
    pub.reload(); ok('edit shows on public page right after Save (no rebuild)', marker in pub.content())
    # add a brand-new store with an offer
    pg.click('#add'); pg.wait_for_selector('#form')
    pg.fill('[data-fk="name"] .ctl','Zebra Gear'); pg.fill('[data-fk="slug"] .ctl','zebra-gear'); pg.fill('[data-fk="domain"] .ctl','zebra.example')
    pg.select_option('[data-fk="category"] select','fashion')
    pg.fill('[data-fk="description"] .ctl','Zebra Gear sells striped outdoor equipment for every season.')
    pg.click('#form button[type=submit]'); pg.wait_for_selector('#rows')
    pub2=br.new_page(); r=pub2.goto(B+'/coupons/zebra-gear/'); ok('new store page is live immediately', r.status==200 and 'Zebra Gear' in pub2.title())
    r=pub2.goto(B+'/stores/'); ok('new store listed on /stores/', 'Zebra Gear' in pub2.content())
    # delete it again
    pg.fill('#q','zebra'); pg.wait_for_timeout(300)
    pg.check('#rows tr[data-id="zebra-gear"] input.sel'); pg.click('#bb [data-b=del]'); pg.wait_for_timeout(1500)
    r=pub2.goto(B+'/coupons/zebra-gear/'); ok('deleted store disappears from public site', r.status==404)
    # media library page + submit form on public site
    pg.click('a[data-v="media"]'); pg.wait_for_selector('text=Media library'); ok('media library opens', True)
    sp=br.new_page(); sp.goto(B+'/submit-coupon/'); sp.wait_for_timeout(2800)
    sp.fill('#sc-store','Nike'); sp.fill('#sc-title','20% off sitewide test'); sp.check('input[name=consent]'); sp.click('#submit-form button[type=submit]')
    sp.wait_for_selector('.nl-msg:not([hidden])'); ok('visitor coupon submission accepted', 'Thank you' in sp.inner_text('.nl-msg'))
    pg.click('a[data-v="submissions"]'); pg.wait_for_selector('text=20% off sitewide test'); ok('submission appears in CMS > Submissions', True)
    nl=br.new_page(); nl.goto(B+'/'); nl.fill('form.nl input[type=email]','fan@example.com'); nl.click('form.nl button[type=submit]'); nl.wait_for_selector('form.nl .nl-msg:not([hidden])'); ok('newsletter signup works', 'Thanks' in nl.inner_text('form.nl .nl-msg'))
    br.close()
print('JS errors:', errors if errors else 'none')
