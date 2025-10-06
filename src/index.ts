import { access } from 'fs'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'

// The type param here specifies what is available in cloudflare's env (envvars, secrets, bindings)
// Regenerate with npx wrangler types
const app = new Hono<{ Bindings: Cloudflare.Env }>()

const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize'

app.get('/auth/login', (c) => {
  const github = new URL(GITHUB_AUTH_ENDPOINT)
  
  // TODO: Replace with BetterAuth?
  const auth_client_id = c.env.OAUTH_CLIENT_ID
  const auth_callback = c.env.AUTH_CALLBACK_URL
  console.log({auth_client_id, auth_callback})
  
  const params = github.searchParams
  params.set('client_id', auth_client_id)
  params.set('redirect_uri', auth_callback)
  params.set('scope', 'read:org,repo')
  // TODO: Add state - a random string, keep it in short term cache
  // Verify if it matches when receiving callback
  return c.redirect(github)
})

app.get('/auth/callback', async (c) => {
	const code = c.req.query('code') as string
	const client_id = c.env.OAUTH_CLIENT_ID
	const client_secret = c.env.OAUTH_CLIENT_SECRET
  	const auth_callback = c.env.AUTH_CALLBACK_URL

	const auth = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: new URLSearchParams({
			client_id,
			client_secret,
			code,
			redirect_uri: auth_callback
		})
	})
	const response = await auth.text();

	// Response text can be pased with URLSearchParams too
	const auth_response = new URLSearchParams(response)

	// It may have errors
	if (auth_response.has('error')) {
		console.log(auth_response)
		// DWIM, early return. Redirect back to login page?
		const error = auth_response.get('error') as string
		const description = auth_response.get('description') as string
		const err_uri = auth_response.get('error_uri') as string
		return c.text(`Authentication error ${error}: ${description}\r\n${err_uri}`, { status: 500 })
	}
	const access_token = auth_response.get('access_token') as string
	const token_type = auth_response.get('token_type') as string // Bearer

	const user = await fetch_github_user(access_token)
	const is_collaborator = await fetch_collaboration_status(access_token, user.login, c.env.GITHUB_REPO_NAME)
	if (!is_collaborator) {
		// Kick out to login screen with an error
		return c.text('Not a repository collaborator', { status: 404 })
	}

	// Now stuff this into cache with a reasonable TTL. For Oauth apps, these tokens are longlived: a year or so
	const uuid = crypto.randomUUID()
	await Promise.all([
		store_in_kv(c.env.sessions, { key: `github-token/1/${user.login}`, value: access_token }),
	    store_in_kv(c.env.sessions, { key: `session/1/${uuid}`, value: user.login })
	])

	setCookie(c, '_session', uuid, { path: '/' })
	return c.redirect('/uploader')
})

type GithubUser = {
	login: string
	id: number
	url: string
	repos_url: string
}

function github_headers(token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${token}`, 
		'Accept': 'application/vnd.github+json',
		'X-Github-Api-Version': '2022-11-28',
		'User-Agent': 'tpwres/1.0.0'
	}
}

async function fetch_github_user(token: string): Promise<GithubUser> {
	const url = 'https://api.github.com/user'	
	const resp = await fetch(url, { headers: github_headers(token)})
	const json = await resp.json()
	return json as GithubUser
}

async function fetch_collaboration_status(access_token: string, login: string, repo: string) {
	const url = `https://api.github.com/repos/${repo}/collaborators/${login}`
	const resp = await fetch(url, { headers: github_headers(access_token)})
	return (resp.status == 204)
}

async function store_in_kv(kv: KVNamespace, { key, value }: {key: string, value: string }) {
	const DAY = 86400 // seconds
	await kv.put(key, value, { expirationTtl: 30 * DAY })
}



export default {
	fetch: app.fetch
}