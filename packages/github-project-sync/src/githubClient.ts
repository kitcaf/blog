const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kitcaf-blog-project-sync'
}

export const fetchGitHubJson = async <TResponse>(url: string, token: string): Promise<TResponse> => {
  const headers: Record<string, string> = { ...GITHUB_API_HEADERS }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${responseText}`)
  }

  return response.json() as Promise<TResponse>
}

