import { renderAdminLayoutCatalyst } from '../layouts/admin-layout-catalyst.template'
import type { AdminLayoutCatalystData } from '../layouts/admin-layout-catalyst.template'

interface Tenant {
  id: string
  name: string
  slug: string
  is_active: number
  settings: string | null
  created_at: number
  updated_at: number
  user_count?: number
  content_count?: number
}

export interface TenantsListPageData {
  tenants: Tenant[]
  user: { name: string; email: string; role: string }
  version?: string
}

export function renderTenantsListPage(data: TenantsListPageData): string {
  const rows = data.tenants.map(t => {
    const createdDate = new Date(t.created_at).toLocaleDateString()
    const statusBadge = t.is_active
      ? '<span class="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 ring-1 ring-inset ring-green-500/20">Active</span>'
      : '<span class="inline-flex items-center rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-500/20">Inactive</span>'

    return `
      <tr class="hover:bg-zinc-800/50 cursor-pointer" onclick="window.location='/admin/tenants/${t.id}'">
        <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">${t.name}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${t.slug}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${t.user_count ?? '-'}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${t.content_count ?? '-'}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm">${statusBadge}</td>
        <td class="whitespace-nowrap px-3 py-4 text-sm text-zinc-400">${createdDate}</td>
      </tr>
    `
  }).join('')

  const emptyState = data.tenants.length === 0 ? `
    <tr>
      <td colspan="6" class="px-6 py-12 text-center text-sm text-zinc-500">
        No tenants yet. Create your first tenant to get started.
      </td>
    </tr>
  ` : ''

  const pageContent = `
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-white">Tenants</h1>
          <p class="mt-2 text-sm text-zinc-400">Manage customer tenants and their CMS instances.</p>
        </div>
        <div class="mt-4 sm:mt-0">
          <button onclick="document.getElementById('create-modal').classList.remove('hidden')"
            class="inline-flex items-center rounded-lg bg-lime-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lime-700 transition-colors shadow-sm">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Create Tenant
          </button>
        </div>
      </div>

      <div class="mt-8 flow-root">
        <div class="overflow-x-auto rounded-xl ring-1 ring-white/10">
          <table class="min-w-full divide-y divide-white/5">
            <thead class="bg-zinc-800/50">
              <tr>
                <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-300 sm:pl-6">Name</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Slug</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Users</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Content</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Status</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-zinc-300">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${rows}${emptyState}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create Tenant Modal -->
    <div id="create-modal" class="hidden fixed inset-0 z-50 overflow-y-auto">
      <div class="flex min-h-full items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/60" onclick="document.getElementById('create-modal').classList.add('hidden')"></div>
        <div class="relative w-full max-w-lg rounded-xl bg-zinc-900 ring-1 ring-white/10 shadow-2xl p-6">
          <h2 class="text-lg font-semibold text-white mb-4">Create New Tenant</h2>
          <form id="create-tenant-form" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1">Tenant Name</label>
              <input type="text" name="name" required placeholder="My Customer"
                class="w-full rounded-lg border-0 bg-zinc-800 px-3 py-2 text-white ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-lime-500 text-sm"/>
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1">Slug</label>
              <input type="text" name="slug" required placeholder="my-customer" pattern="[a-z0-9-]+"
                class="w-full rounded-lg border-0 bg-zinc-800 px-3 py-2 text-white ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-lime-500 text-sm"/>
              <p class="mt-1 text-xs text-zinc-500">Lowercase letters, numbers, and hyphens only.</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1">Admin Email</label>
              <input type="email" name="adminEmail" required placeholder="admin@customer.com"
                class="w-full rounded-lg border-0 bg-zinc-800 px-3 py-2 text-white ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-lime-500 text-sm"/>
            </div>
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1">Admin Password</label>
              <input type="password" name="adminPassword" required minlength="8" placeholder="Min 8 characters"
                class="w-full rounded-lg border-0 bg-zinc-800 px-3 py-2 text-white ring-1 ring-inset ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-lime-500 text-sm"/>
            </div>
            <div id="create-error" class="hidden rounded-lg bg-red-500/10 p-3 text-sm text-red-400 ring-1 ring-inset ring-red-500/20"></div>
            <div id="create-success" class="hidden rounded-lg bg-green-500/10 p-3 text-sm text-green-400 ring-1 ring-inset ring-green-500/20"></div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" onclick="document.getElementById('create-modal').classList.add('hidden')"
                class="rounded-lg px-3.5 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">Cancel</button>
              <button type="submit" id="create-btn"
                class="rounded-lg bg-lime-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-lime-700 transition-colors shadow-sm">Create Tenant</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <script>
      document.getElementById('create-tenant-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('create-btn');
        const errorDiv = document.getElementById('create-error');
        const successDiv = document.getElementById('create-success');
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = 'Creating...';

        try {
          const res = await fetch('/admin/tenants/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name.value,
              slug: form.slug.value,
              adminEmail: form.adminEmail.value,
              adminPassword: form.adminPassword.value
            })
          });
          const data = await res.json();
          if (!res.ok) {
            errorDiv.textContent = data.error || 'Failed to create tenant';
            errorDiv.classList.remove('hidden');
          } else {
            successDiv.innerHTML = 'Tenant created! API Token: <code class="bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono break-all">' + data.apiToken + '</code><br/><span class="text-xs text-zinc-500">Save this token — it will not be shown again.</span>';
            successDiv.classList.remove('hidden');
            form.reset();
            setTimeout(() => window.location.reload(), 3000);
          }
        } catch (err) {
          errorDiv.textContent = 'Network error';
          errorDiv.classList.remove('hidden');
        }
        btn.disabled = false;
        btn.textContent = 'Create Tenant';
      });

      // Auto-generate slug from name
      document.querySelector('input[name="name"]').addEventListener('input', (e) => {
        const slugInput = document.querySelector('input[name="slug"]');
        if (!slugInput.dataset.manual) {
          slugInput.value = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
      });
      document.querySelector('input[name="slug"]').addEventListener('input', (e) => {
        e.target.dataset.manual = 'true';
      });
    </script>
  `

  const layoutData: AdminLayoutCatalystData = {
    title: 'Tenants',
    pageTitle: 'Tenant Management',
    currentPath: '/admin/tenants',
    user: data.user,
    version: data.version,
    content: pageContent
  }

  return renderAdminLayoutCatalyst(layoutData)
}
