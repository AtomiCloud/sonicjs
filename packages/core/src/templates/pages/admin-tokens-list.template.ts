import { renderAdminLayoutCatalyst } from '../layouts/admin-layout-catalyst.template'
import type { AdminLayoutCatalystData } from '../layouts/admin-layout-catalyst.template'

interface SuperAdminToken {
  id: string
  name: string
  user_email: string
  created_at: number
  last_used_at: number | null
  expires_at: number | null
}

export interface TokensListPageData {
  tokens: SuperAdminToken[]
  user: { name: string; email: string; role: string }
  version?: string
}

export function renderTokensListPage(data: TokensListPageData): string {
  const rows = data.tokens.map(t => {
    const created = new Date(t.created_at).toLocaleString()
    const lastUsed = t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'Never'
    return `
      <tr data-token-id="${t.id}">
        <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">${escapeHtml(t.name)}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${escapeHtml(t.user_email)}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${created}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${lastUsed}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-right">
          <button
            type="button"
            class="rounded-md bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-500/20 transition-colors"
            onclick="revokeToken('${t.id}', '${escapeHtmlAttr(t.name)}')"
          >Revoke</button>
        </td>
      </tr>
    `
  }).join('')

  const emptyState = data.tokens.length === 0 ? `
    <tr>
      <td colspan="5" class="px-6 py-12 text-center text-sm text-zinc-500">
        No super admin tokens yet. Mint one to allow Mercury (or other cross-tenant clients) to push to any tenant.
      </td>
    </tr>
  ` : ''

  const pageContent = `
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-white">Super Admin API Tokens</h1>
          <p class="mt-2 text-sm text-zinc-400">
            Cross-tenant <code class="text-xs text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded">ffx_</code> tokens for service clients (e.g. Mercury pipeline).
            Send <code class="text-xs text-zinc-300 bg-zinc-800 px-1 py-0.5 rounded">X-Tenant-Id</code> header to scope each request to a tenant.
          </p>
        </div>
        <div class="mt-4 sm:mt-0">
          <button onclick="document.getElementById('mint-modal').classList.remove('hidden')"
            class="inline-flex items-center rounded-lg bg-lime-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lime-700 transition-colors shadow-sm">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Mint Token
          </button>
        </div>
      </div>

      <div class="mt-8 flow-root">
        <div class="overflow-x-auto rounded-xl ring-1 ring-white/10">
          <table class="min-w-full divide-y divide-white/5">
            <thead class="bg-zinc-800/50">
              <tr>
                <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-300 sm:pl-6">Name</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Owner</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Created</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Last Used</th>
                <th scope="col" class="px-3 py-3.5 text-right text-sm font-semibold text-zinc-300 sm:pr-6">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${rows}${emptyState}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="mint-modal" class="hidden fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60" onclick="closeMintModal()"></div>
        <div class="relative w-full max-w-lg rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-white mb-4">Mint Super Admin Token</h2>
          <form id="mint-form" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1">Token Name</label>
              <input type="text" name="name" required maxlength="100" placeholder="mercury-pipeline"
                class="w-full rounded-lg border-0 bg-zinc-800 px-3 py-2 text-white ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-lime-500 text-sm"/>
              <p class="mt-1 text-xs text-zinc-500">Descriptive name to identify this token in the list.</p>
            </div>
            <div id="mint-error" class="hidden rounded-lg bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-inset ring-red-500/20"></div>
            <div id="mint-success" class="hidden rounded-lg bg-green-500/10 p-3 text-sm text-green-400 ring-1 ring-inset ring-green-500/20"></div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" onclick="closeMintModal()"
                class="rounded-lg px-3.5 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">Cancel</button>
              <button type="submit" id="mint-btn"
                class="rounded-lg bg-lime-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lime-700 transition-colors shadow-sm">Mint Token</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <script>
      function closeMintModal() {
        const modal = document.getElementById('mint-modal');
        modal.classList.add('hidden');
        document.getElementById('mint-form').reset();
        document.getElementById('mint-error').classList.add('hidden');
        document.getElementById('mint-success').classList.add('hidden');
        const btn = document.getElementById('mint-btn');
        btn.disabled = false;
        btn.textContent = 'Mint Token';
        btn.type = 'submit';
        btn.onclick = null;
      }

      document.getElementById('mint-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('mint-btn');
        const errorDiv = document.getElementById('mint-error');
        const successDiv = document.getElementById('mint-success');
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = 'Minting...';

        try {
          const res = await fetch('/admin/tokens/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.name.value })
          });
          const data = await res.json();
          if (!res.ok) {
            errorDiv.textContent = data.error || 'Failed to mint token';
            errorDiv.classList.remove('hidden');
          } else {
            successDiv.innerHTML = '<p class="font-medium mb-2">Token minted!</p><p class="mb-1 text-xs text-green-300">Copy this token now — it will not be shown again.</p><div class="flex items-center gap-2"><code id="api-token-value" class="bg-zinc-800 px-2 py-1 rounded text-xs font-mono break-all flex-1">' + data.apiToken + '</code><button type="button" onclick="navigator.clipboard.writeText(document.getElementById(\\'api-token-value\\').textContent).then(()=>{this.textContent=\\'Copied!\\';setTimeout(()=>this.textContent=\\'Copy\\',2000)})" class="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600">Copy</button></div>';
            successDiv.classList.remove('hidden');
            btn.textContent = 'Done';
            btn.type = 'button';
            btn.onclick = () => window.location.reload();
            btn.disabled = false;
            return;
          }
        } catch (err) {
          errorDiv.textContent = 'Network error';
          errorDiv.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = 'Mint Token';
      });

      async function revokeToken(id, name) {
        if (!confirm('Revoke token "' + name + '"? This cannot be undone — any service using this token will immediately stop working.')) return;
        try {
          const res = await fetch('/admin/tokens/api/' + encodeURIComponent(id), { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Failed to revoke token');
            return;
          }
          window.location.reload();
        } catch (err) {
          alert('Network error');
        }
      }
    </script>
  `

  const layoutData: AdminLayoutCatalystData = {
    title: 'Super Admin Tokens',
    pageTitle: 'Super Admin Tokens',
    currentPath: '/admin/tokens',
    user: data.user,
    version: data.version,
    content: pageContent
  }

  return renderAdminLayoutCatalyst(layoutData)
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;')
}
