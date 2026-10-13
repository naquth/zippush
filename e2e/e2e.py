import io, os, sys, zipfile, hashlib, json, re
from playwright.sync_api import sync_playwright, expect
from mock_github import MockGitHub, blob_sha

URL = 'http://localhost:3100'
gh = MockGitHub()
PNG = bytes([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]) + os.urandom(3000) + b'\x00\xff'
# ZIP "ala Mac": folder pembungkus + __MACOSX + .DS_Store + nama aneh (# dan spasi) + biner + file executable
zbuf = io.BytesIO()
with zipfile.ZipFile(zbuf, 'w') as z:
    def add(name, data, mode=0o644):
        zi = zipfile.ZipInfo(name); zi.external_attr = (0o100000 | mode) << 16; z.writestr(zi, data)
    add('proj/index.html', '<h1>Halo ✓</h1>\r\n')
    add('proj/src/app.ts', 'export const x = 1\n')
    add('proj/my file#1.txt', 'nama file berisi # dan spasi\n')
    add('proj/img/logo.png', PNG)
    add('proj/run.sh', '#!/bin/sh\necho hi\n', 0o755)
    add('proj/README.md', '# demo\n')           # identik dengan yang sudah di repo -> harus dilewati
    add('__MACOSX/proj/._index.html', 'junk'); add('proj/.DS_Store', 'junk')
open('/tmp/test.zip', 'wb').write(zbuf.getvalue())

errors, csp = [], []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg); 
    if not cond: errors.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, color_scheme='light', accept_downloads=True)
    ctx.route('https://api.github.com/**', gh.handle)
    page = ctx.new_page()
    page.on('console', lambda m: (csp.append(m.text) if 'Content Security Policy' in m.text or 'Refused' in m.text else None, errors.append('console.error: ' + m.text[:200]) if m.type == 'error' and 'favicon' not in m.text else None))
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)[:200]))
    page.goto(URL); page.wait_for_load_state('networkidle')

    # ── logo ──
    vis = page.locator('header img[alt="Naquth"]:visible')
    check(vis.count() == 1, 'tepat 1 logo terlihat di tema terang')
    check(vis.first.evaluate('i=>i.naturalWidth>0') and 'logo-dark' in vis.first.get_attribute('src'), 'tema terang memakai logo HITAM (logo-dark.png) & gambar termuat')
    page.screenshot(path='/tmp/naquth_s1_light_home.png')

    # ── pengaturan ──
    page.get_by_role('tab', name='Pengaturan').click()
    page.get_by_label('Personal Access Token').fill('ghp_faketoken123')
    page.get_by_role('button', name='Simpan', exact=True).click()
    expect(page.get_by_text('Terhubung sebagai @tester')).to_be_visible(timeout=8000)
    check(True, 'token tersimpan → user terdeteksi (@tester) + scope dibaca')
    expect(page.get_by_text('Scope: repo, workflow')).to_be_visible()
    # pilih repo PRIVAT dari dropdown (bug asli: /users/{u}/repos hanya publik)
    page.get_by_role('combobox').first.click()
    opt = page.get_by_role('option', name='tester/demo')
    check(opt.count() == 1 and '🔒' in opt.inner_text(), 'repo PRIVAT muncul di dropdown')
    opt.click()
    page.get_by_role('button', name='Simpan', exact=True).click()
    page.wait_for_timeout(600)
    # token TIDAK boleh tersimpan permanen (default)
    idb_has_token = page.evaluate("""async()=>{ return await new Promise(res=>{ const r=indexedDB.open('keyval-store'); r.onsuccess=()=>{ try{ const g=r.result.transaction('keyval').objectStore('keyval').get('naquth-token'); g.onsuccess=()=>res(g.result??null); g.onerror=()=>res('err') }catch(e){res('nostore')} }; r.onerror=()=>res('err') }) }""")
    check(idb_has_token in (None, 'nostore'), f'token TIDAK tersimpan di IndexedDB secara default (hasil: {idb_has_token!r})')
    check(page.evaluate("sessionStorage.getItem('naquth-token')") == 'ghp_faketoken123', 'token hanya di sessionStorage (hilang saat tab ditutup)')

    # ── unggah ZIP ──
    page.get_by_role('tab', name='Unggah').click()
    rs = page.get_by_role('combobox', name='Repositori tujuan')
    expect(rs).to_contain_text('tester/demo')
    check(True, 'tab Unggah: pemilih repositori menampilkan repo aktif (tester/demo)')
    rs.click(); page.get_by_role('option', name='tester/public-one').click()
    expect(rs).to_contain_text('public-one')
    check(True, 'tab Unggah: bisa pindah ke repo lain')
    rs.click(); page.get_by_role('option', name='tester/demo').click()
    expect(rs).to_contain_text('tester/demo')
    page.wait_for_timeout(500)
    expect(page.get_by_role('combobox', name='Branch')).to_contain_text('main')
    check(True, 'tab Unggah: pemilih branch ikut terisi (main)')
    page.locator('input[accept=".zip,application/zip"]').set_input_files('/tmp/test.zip')
    expect(page.get_by_text('Antrean Unggahan')).to_be_visible(timeout=8000)
    check(page.get_by_text('8 file').count() >= 1, 'ZIP dibaca: 8 entri file (termasuk 2 sampah) masuk antrean')
    page.get_by_role('button', name='Pratinjau').click()
    expect(page.get_by_text('Pratinjau perubahan')).to_be_visible(timeout=8000)
    before = (len(gh.commits), gh.head)
    check(gh.head == before[1] and gh.n_commits() == 0, 'pratinjau TIDAK menulis apa pun (0 commit baru)')
    txt = page.locator('main').inner_text()
    check('+5 baru' in txt and '=1 sama' in txt, 'pratinjau: 5 baru, 1 identik (README) dilewati')
    check('my file#1.txt' in txt, 'pratinjau menampilkan nama file ber-# apa adanya')
    page.screenshot(path='/tmp/naquth_s2_preview.png', full_page=True)

    gh.counts.clear()
    page.get_by_role('button', name='Unggah sekarang').click()
    expect(page.get_by_role('heading', name='Berhasil di-push')).to_be_visible(timeout=15000)
    files = gh.head_files()
    check(gh.n_commits() == 1, 'tepat 1 commit untuk seluruh unggahan')
    check(sorted(files) == sorted(['README.md','old/stale.txt','index.html','src/app.ts','my file#1.txt','img/logo.png','run.sh']), f'struktur repo benar (root "proj/" dibuang, tanpa __MACOSX/.DS_Store): {sorted(files)}')
    check(files['img/logo.png'] == PNG, 'biner (PNG) identik byte-per-byte')
    check(files['index.html'] == '<h1>Halo ✓</h1>\r\n'.encode(), 'teks UTF-8 + CRLF identik byte-per-byte')
    check(files['my file#1.txt'] == 'nama file berisi # dan spasi\n'.encode(), 'file "my file#1.txt" tersimpan dengan nama benar (bug asli: jadi "my file")')
    check('old/stale.txt' in files, 'mode mirror MATI → file lama tidak dihapus')
    mode_run = gh.trees[gh.commits[gh.head]['tree']]['run.sh'][1]
    check(mode_run == '100755', f'bit executable dari ZIP terbawa (mode {mode_run})')
    total = sum(gh.counts.values())
    wr = {k: v for k, v in gh.counts.items() if k.startswith(('POST', 'PATCH'))}
    print('     request writes:', wr, '| total:', total)
    check(gh.counts.get('POST /repos/{o}/{r}/git/blobs', 0) == 1 and total <= 12, f'{total} request total untuk 5 file (engine lama: 10+ berurutan, tanpa batas atas)')
    check(page.get_by_text('Antrean Unggahan').count() == 0, 'antrean dikosongkan HANYA setelah sukses')
    page.screenshot(path='/tmp/naquth_s3_done.png', full_page=True)

    # ── mirror + target folder ──
    page.get_by_role('tab', name='Pengaturan').click()
    page.get_by_label('Target folder (opsional)').fill('/docs//v1/')
    page.get_by_role('button', name='Simpan', exact=True).click()
    page.get_by_role('tab', name='Unggah').click()
    page.locator('input[accept=".zip,application/zip"]').set_input_files('/tmp/test.zip')
    expect(page.get_by_text('Antrean Unggahan')).to_be_visible(timeout=8000)
    page.get_by_label('Hapus file lama (mirror)').click()
    page.get_by_role('button', name='Unggah', exact=True).click()
    expect(page.get_by_role('dialog').get_by_text('Hapus file lama?')).to_be_visible()
    page.get_by_role('button', name='Ya, hapus & unggah').click()
    expect(page.get_by_role('heading', name='Berhasil di-push')).to_be_visible(timeout=15000)
    files = gh.head_files()
    check(all(f in files for f in ['README.md', 'old/stale.txt', 'index.html']), 'mirror dibatasi target folder: file di luar "docs/v1" TIDAK tersentuh')
    check('docs/v1/index.html' in files and 'docs/v1/my file#1.txt' in files, 'target folder "/docs//v1/" dinormalisasi → docs/v1/…')

    # ── explorer: hapus folder dalam 1 commit ──
    c_before = gh.n_commits()
    page.get_by_role('tab', name='Penjelajah').click()
    expect(page.get_by_role('button', name='docs', exact=True)).to_be_visible(timeout=8000)
    page.get_by_role('button', name='Hapus docs').click()
    page.get_by_role('dialog').get_by_role('button', name='Hapus', exact=True).click()
    page.wait_for_timeout(1500)
    check(gh.n_commits() == c_before + 1 and not any(f.startswith('docs/') for f in gh.head_files()), 'hapus folder "docs" (6 file) = 1 commit, bersih')

    # ── repositori: hapus butuh ketik nama ──
    page.get_by_role('tab', name='Repositori').click()
    expect(page.get_by_text('2 repositori')).to_be_visible(timeout=8000)
    page.get_by_role('button', name='Hapus demo').click()
    delbtn = page.get_by_role('dialog').get_by_role('button', name='Hapus permanen')
    check(delbtn.is_disabled(), 'hapus repo terkunci sampai nama diketik')
    page.keyboard.press('Escape')

    # ── tema gelap + mobile ──
    page.emulate_media(color_scheme='dark'); page.evaluate("localStorage.setItem('theme','dark')"); page.reload(); page.wait_for_load_state('networkidle')
    vis = page.locator('header img[alt="Naquth"]:visible')
    check(vis.count() == 1 and 'logo-light' in vis.first.get_attribute('src'), 'tema gelap memakai logo PUTIH (logo-light.png)')
    page.screenshot(path='/tmp/naquth_s4_dark_desktop.png')
    m = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark', device_scale_factor=2)
    m.route('https://api.github.com/**', gh.handle); mp = m.new_page(); mp.goto(URL); mp.wait_for_load_state('networkidle')
    mp.screenshot(path='/tmp/naquth_s5_mobile_dark.png')
    sw = mp.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
    mp.wait_for_timeout(1500); sw = mp.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
    check(sw, 'service worker terdaftar')
    overflow = mp.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    check(not overflow, 'mobile 390px: tidak ada scroll horizontal')
    b.close()

check(not csp, f'tidak ada pelanggaran CSP ({csp[:2]})')
print('\nERRORS:', errors if errors else 'none')
print('\nGitHub palsu — ringkasan request:'); [print('  ', v, k) for k, v in sorted(gh.counts.items())]
sys.exit(1 if errors else 0)
