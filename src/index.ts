import { Hono } from 'hono'

const app = new Hono()

const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/auth/authorize'

app.get('/auth/login', (c) => {
  const github = new URL(GITHUB_AUTH_ENDPOINT)
  
  // TODO: Replace with BetterAuth?
  const auth_client_id = process.env.OAUTH_CLIENT_ID as string
  const auth_callback = process.env.AUTH_CALLBACK_URL as string
  
  const params = github.searchParams
  params.set('client_id', auth_client_id)
  params.set('redirect_uri', auth_callback)
  params.set('scope', 'read:user')
  return c.redirect(github)
})

app.get('/auth/callback', (c) => {
	const client_id = c.req.param('client_id')
	const client_secret = c.req.param('client_secret')
	const code = c.req.param('code')

	return c.text(`
		clientid=${client_id}
		secret=${client_secret}
		code=${code}
	`)
})

export default {
	fetch: app.fetch
}