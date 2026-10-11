import { SheetFrame } from './ui';

const C = (p: { children: string }) => <code>{p.children}</code>;

export function NotifyGuide() {
  return (
    <SheetFrame title="Notification setup">
      <div class="guide">
        <p class="muted small">
          One-time setup, about 10 minutes, all free. You make a free Cloudflare account and GitHub puts the notification server on it.
          Notifications are encrypted on this phone, so the server only sees times, never your assignments.
        </p>

        <h3>1. Cloudflare account</h3>
        <ol>
          <li>Go to <b>dash.cloudflare.com</b> and sign up (free, no card).</li>
          <li>Open <b>Workers & Pages</b>. If it asks you to pick a <b>workers.dev subdomain</b>, choose any name and save.</li>
          <li>
            Copy your <b>Account ID</b>: it's on the Workers & Pages overview page (right side), or in the address bar after{' '}
            <C>dash.cloudflare.com/</C>.
          </li>
        </ol>

        <h3>2. API token</h3>
        <ol>
          <li>Click the profile icon (top right) → <b>My Profile</b> → <b>API Tokens</b> → <b>Create Token</b>.</li>
          <li>Next to <b>Edit Cloudflare Workers</b>, tap <b>Use template</b>.</li>
          <li>Under Account Resources pick your account; under Zone Resources pick <b>All zones</b>.</li>
          <li><b>Continue to summary</b> → <b>Create Token</b>, then copy the token (it's shown once).</li>
        </ol>

        <h3>3. Give them to GitHub</h3>
        <ol>
          <li>
            On GitHub open the repo → <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>.
          </li>
          <li>Name <C>CLOUDFLARE_API_TOKEN</C>, paste the token, save.</li>
          <li>New secret again: name <C>CLOUDFLARE_ACCOUNT_ID</C>, paste the Account ID, save.</li>
        </ol>

        <h3>4. Start the server</h3>
        <ol>
          <li>In the repo, open <b>Actions</b> → <b>Deploy notification server</b> → <b>Run workflow</b> → branch <b>dev</b> → <b>Run</b>.</li>
          <li>When it turns green (about a minute), open the run. The summary shows your server address, like <C>https://planner-push.yourname.workers.dev</C>.</li>
        </ol>

        <h3>5. Turn on</h3>
        <ol>
          <li>Back here in <b>Settings → Notifications</b>, paste the address and tap <b>Turn on notifications</b>. Allow when iOS asks.</li>
          <li>Tap <b>Send test</b>. A notification should arrive within a few seconds.</li>
        </ol>
        <p class="muted small">
          After that it's automatic: every change to your plan updates the server, and each assignment notifies you at its start time.
          Your phone needs internet to receive them.
        </p>
      </div>
    </SheetFrame>
  );
}
