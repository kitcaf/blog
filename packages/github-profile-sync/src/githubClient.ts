const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kitcaf-blog-profile-sync'
}

export const fetchGitHubJson = async <TResponse>({
  url,
  token,
  method = 'GET',
  body,
  headers = {}
}: {
  url: string
  token: string
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
}): Promise<TResponse> => {
  const requestHeaders: Record<string, string> = {
    ...GITHUB_API_HEADERS,
    ...headers
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${responseText}`)
  }

  return response.json() as Promise<TResponse>
}

