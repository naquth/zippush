import json, hashlib, base64, re, itertools
from urllib.parse import urlparse, parse_qs, unquote

def blob_sha(b: bytes) -> str:
    return hashlib.sha1(b'blob %d\0' % len(b) + b).hexdigest()

class MockGitHub:
    """GitHub palsu dengan semantik Git asli: sha blob nyata, tree berantai, penolakan path ganda."""
    def __init__(self):
        self.blobs = {}; self.trees = {}; self.commits = {}; self.n = itertools.count(1)
        self.requests = []; self.counts = {}
        t = self._mk_tree({}); self.trees[t] = {}
        # repo awal: README + folder lama
        seed = {'README.md': b'# demo\n', 'old/stale.txt': b'old'}
        tree = {p: (self._blob(c), '100644') for p, c in seed.items()}
        ts = self._mk_tree(tree); c0 = f'c{next(self.n):040d}'
        self.commits[c0] = {'tree': ts, 'parent': None, 'message': 'init'}
        self.head = c0
    def _blob(self, data: bytes):
        s = blob_sha(data); self.blobs[s] = data; return s
    def _mk_tree(self, t):
        s = f't{next(self.n):040d}'; self.trees[s] = dict(t); return s
    def head_files(self):
        return {p: self.blobs[sha] for p, (sha, m) in self.trees[self.commits[self.head]['tree']].items()}
    def n_commits(self):
        return sum(1 for c in self.commits.values() if c['parent'])

    CORS = {'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-oauth-scopes, x-ratelimit-remaining',
            'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS'}

    def handle(self, route, request):
        u = urlparse(request.url); path = unquote(u.path); q = parse_qs(u.query); m = request.method
        if m == 'OPTIONS':
            return route.fulfill(status=204, headers=self.CORS)
        key = f'{m} ' + re.sub(r'/[0-9a-f]{40}', '/{sha}', re.sub(r'/repos/[^/]+/[^/]+', '/repos/{o}/{r}', path)); self.counts[key] = self.counts.get(key, 0) + 1
        self.requests.append((m, path))
        def ok(body, status=200, extra=None):
            h = {**self.CORS, 'content-type': 'application/json', **(extra or {})}
            route.fulfill(status=status, headers=h, body=json.dumps(body))
        body = json.loads(request.post_data) if request.post_data else None
        if path == '/user': return ok({'login': 'tester', 'name': 'Test Er', 'avatar_url': ''}, extra={'x-oauth-scopes': 'repo, workflow'})
        if path == '/user/repos' and m == 'GET':
            page = int(q.get('page', ['1'])[0])
            repos = [
              {'id': 1, 'name': 'demo', 'full_name': 'tester/demo', 'private': True, 'description': 'repo privat', 'html_url': 'x', 'default_branch': 'main', 'language': 'TS', 'stargazers_count': 1, 'forks_count': 0, 'owner': {'login': 'tester'}, 'permissions': {'admin': True}},
              {'id': 2, 'name': 'public-one', 'full_name': 'tester/public-one', 'private': False, 'description': None, 'html_url': 'x', 'default_branch': 'main', 'language': None, 'stargazers_count': 0, 'forks_count': 0, 'owner': {'login': 'tester'}, 'permissions': {'admin': True}}]
            return ok(repos if page == 1 else [])
        if re.fullmatch(r'/repos/tester/demo/branches', path): return ok([{'name': 'main'}, {'name': 'dev'}])
        if path == '/repos/tester/demo/git/ref/heads/main': return ok({'object': {'sha': self.head}})
        mm = re.fullmatch(r'/repos/tester/demo/git/commits/([0-9a-z]+)', path)
        if mm and m == 'GET': return ok({'tree': {'sha': self.commits[mm.group(1)]['tree']}})
        mm = re.fullmatch(r'/repos/tester/demo/git/trees/([0-9a-z]+)', path)
        if mm and m == 'GET':
            t = self.trees[mm.group(1)]
            return ok({'truncated': False, 'tree': [{'path': p, 'type': 'blob', 'sha': s, 'mode': md} for p, (s, md) in t.items()]})
        if path == '/repos/tester/demo/git/blobs':
            data = base64.b64decode(body['content']); return ok({'sha': self._blob(data)}, 201)
        if path == '/repos/tester/demo/git/trees' and m == 'POST':
            t = dict(self.trees[body['base_tree']]); seen = set()
            for it in body['tree']:
                if it['path'] in seen: return ok({'message': 'duplicate path ' + it['path']}, 422)
                seen.add(it['path'])
                if it.get('sha', 1) is None: t.pop(it['path'], None); continue
                if 'content' in it: t[it['path']] = (self._blob(it['content'].encode('utf-8')), it['mode'])
                else:
                    if it['sha'] not in self.blobs: return ok({'message': 'missing blob'}, 422)
                    t[it['path']] = (it['sha'], it['mode'])
            ps = list(t)
            for a in ps:
                for b in ps:
                    if b.startswith(a + '/'): return ok({'message': f'file/dir conflict {a} {b}'}, 422)
            return ok({'sha': self._mk_tree(t)}, 201)
        if path == '/repos/tester/demo/git/commits' and m == 'POST':
            c = f'c{next(self.n):040d}'; self.commits[c] = {'tree': body['tree'], 'parent': body['parents'][0], 'message': body['message']}
            return ok({'sha': c}, 201)
        if path == '/repos/tester/demo/git/refs/heads/main' and m == 'PATCH':
            self.head = body['sha']; return ok({'ref': 'refs/heads/main'})
        if path == '/repos/tester/demo/contents' or path.startswith('/repos/tester/demo/contents/'):
            sub = path[len('/repos/tester/demo/contents'):].strip('/')
            files = self.trees[self.commits[self.head]['tree']]
            out = {}
            for p, (sha, md) in files.items():
                if sub and not p.startswith(sub + '/'): continue
                rest = p[len(sub) + 1:] if sub else p
                seg = rest.split('/')[0]; full = (sub + '/' if sub else '') + seg
                if '/' in rest: out[seg] = {'name': seg, 'path': full, 'sha': 'd' + seg, 'size': 0, 'type': 'dir', 'download_url': None, 'html_url': 'x'}
                else: out[seg] = {'name': seg, 'path': full, 'sha': sha, 'size': len(self.blobs[sha]), 'type': 'file', 'download_url': 'https://raw.example/' + full, 'html_url': 'https://github.com/x/' + full}
            if not out: return ok({'message': 'Not Found'}, 404)
            return ok(list(out.values()))
        return ok({'message': 'mock: unhandled ' + m + ' ' + path}, 404)
