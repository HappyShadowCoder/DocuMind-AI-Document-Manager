import React from "react";

export default function DocumentationPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:flex-row">
      
      {/* Sidebar Navigation */}
      <aside className="w-full flex-shrink-0 border-b border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r md:overflow-y-auto">
        <h2 className="mb-8 text-2xl font-bold tracking-tight">Documentation</h2>
        <nav className="space-y-1">
          <a 
            href="#setup-and-installation" 
            className="block rounded-md px-3 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            Setup and Installation
          </a>
          <a 
            href="#how-to-use" 
            className="block rounded-md px-3 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            How to Use
          </a>
          <a 
            href="#how-to-setup-in-office" 
            className="block rounded-md px-3 py-2.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            How to setup in office
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-16 lg:px-24">
        <div className="mx-auto max-w-4xl space-y-20">
          
          {/* Section 1: Setup and Installation */}
          <section id="setup-and-installation" className="scroll-mt-12">
            <h1 className="mb-6 border-b border-slate-200 pb-4 text-3xl font-bold dark:border-slate-800 md:text-4xl">
              Setup and Installation
            </h1>
            <p className="mb-6 text-lg text-slate-600 dark:text-slate-400">
              Follow these steps to get the application running on your local machine.
            </p>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ol className="list-decimal space-y-4 pl-5 text-slate-700 dark:text-slate-300">
                <li>
                  <strong className="text-slate-900 dark:text-white">Clone the repository:</strong> Pull down the latest code from the main branch.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Install dependencies:</strong> Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">npm install</code> or <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">yarn install</code> in your terminal.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Configure environment variables:</strong> Copy the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">.env.example</code> file to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">.env</code> and fill in your database credentials and API keys.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Start the server:</strong> Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-slate-800">npm run dev</code> to launch the development server on localhost.
                </li>
              </ol>
            </div>
          </section>

          {/* Section 2: How to Use */}
          <section id="how-to-use" className="scroll-mt-12">
            <h1 className="mb-6 border-b border-slate-200 pb-4 text-3xl font-bold dark:border-slate-800 md:text-4xl">
              How to Use
            </h1>
            <p className="mb-6 text-lg text-slate-600 dark:text-slate-400">
              Learn how to navigate the platform and utilize its core features effectively.
            </p>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ul className="list-disc space-y-4 pl-5 text-slate-700 dark:text-slate-300">
                <li>
                  <strong className="text-slate-900 dark:text-white">File Management:</strong> Use the main dashboard to drag and drop files for upload.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Organization:</strong> Create folders and nest them to keep your documents structured.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Collaboration:</strong> Select any file or folder and click &quot;Share&quot; to grant access to other team members.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 3: How to setup in office */}
          <section id="how-to-setup-in-office" className="scroll-mt-12">
            <h1 className="mb-6 border-b border-slate-200 pb-4 text-3xl font-bold dark:border-slate-800 md:text-4xl">
              How to setup in office
            </h1>
            <p className="mb-6 text-lg text-slate-600 dark:text-slate-400">
              Instructions for deploying and configuring the application securely within an office network environment.
            </p>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <ul className="list-disc space-y-4 pl-5 text-slate-700 dark:text-slate-300">
                <li>
                  <strong className="text-slate-900 dark:text-white">Network Whitelisting:</strong> Ensure your office static IP addresses are whitelisted in your database firewall settings.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Reverse Proxy Setup:</strong> Configure an internal server (like Nginx) to route traffic securely to the application port.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Authentication:</strong> If using Active Directory or a custom SSO provider, ensure the callback URLs match your internal network domain.
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-white">Storage Permissions:</strong> Verify that the server running the application has read/write access to the designated local storage directories.
                </li>
              </ul>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}