import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Payment Success - SlotHunter',
    description: 'Your SlotHunter license is ready!',
};

export default function SuccessPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-center p-4">
            <div className="max-w-lg w-full">
                {/* Success Card */}
                <div className="bg-gray-800/50 rounded-2xl p-8 border border-gray-700 text-center">
                    {/* Success Icon */}
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-bold mb-2">Payment Successful! 🎉</h1>
                    <p className="text-gray-400 mb-8">Your SlotHunter license is ready to use.</p>

                    {/* License Key Display */}
                    <div id="license-container" className="bg-gray-900 rounded-xl p-6 mb-6">
                        <p className="text-sm text-gray-400 mb-2">Your License Key</p>
                        <div className="flex items-center justify-center gap-2">
                            <code id="license-key" className="text-2xl font-mono font-bold text-emerald-400">
                                Loading...
                            </code>
                            <button
                                id="copy-btn"
                                className="p-2 hover:bg-gray-700 rounded-lg transition"
                                title="Copy to clipboard"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Order Details */}
                    <div id="order-details" className="text-left bg-gray-900/50 rounded-xl p-4 mb-6 text-sm">
                        <div className="flex justify-between py-2 border-b border-gray-700">
                            <span className="text-gray-400">Order ID</span>
                            <span id="order-id" className="font-mono">-</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-700">
                            <span className="text-gray-400">Plan</span>
                            <span id="plan-type" className="text-emerald-400">-</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-700">
                            <span className="text-gray-400">Email</span>
                            <span id="email">-</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-400">Expires</span>
                            <span id="expires-at">-</span>
                        </div>
                    </div>

                    {/* Next Steps */}
                    <div className="text-left bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-emerald-400 mb-2">📌 Next Steps</h3>
                        <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                            <li>Copy your license key above</li>
                            <li>Open SlotHunter Chrome Extension</li>
                            <li>Paste your license key to activate</li>
                            <li>Start hunting for visa slots!</li>
                        </ol>
                    </div>

                    {/* Download Extension */}
                    <a
                        href="https://chrome.google.com/webstore"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold rounded-lg transition"
                    >
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0112 6.545h10.691A12 12 0 0012 0zM1.931 5.47A11.943 11.943 0 000 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 01-6.865-2.29zm13.342 2.166a5.446 5.446 0 011.45 7.09l.002.001h-.002l-3.953 6.848c.062.003.124.007.187.007 6.627 0 12-5.373 12-12 0-1.164-.166-2.29-.478-3.354z" />
                        </svg>
                        Download Chrome Extension
                    </a>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-6">
                    Need help? Contact <a href="mailto:support@slothunter.id" className="text-emerald-400 hover:underline">support@slothunter.id</a>
                </p>
            </div>

            {/* Client-side script to fetch order details */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
            document.addEventListener('DOMContentLoaded', async function() {
              const urlParams = new URLSearchParams(window.location.search);
              const orderId = urlParams.get('order_id');
              
              if (!orderId) {
                document.getElementById('license-key').textContent = 'No order found';
                return;
              }

              try {
                // Fetch payment success data
                const response = await fetch('/api/payment/mock-success?order_id=' + orderId);
                const result = await response.json();

                if (result.success && result.data) {
                  const { licenseKey, orderId: oid, planType, email, expiresAt } = result.data;
                  
                  document.getElementById('license-key').textContent = licenseKey;
                  document.getElementById('order-id').textContent = oid;
                  document.getElementById('plan-type').textContent = planType;
                  document.getElementById('email').textContent = email;
                  document.getElementById('expires-at').textContent = expiresAt 
                    ? new Date(expiresAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Lifetime';
                } else {
                  document.getElementById('license-key').textContent = 'Error loading license';
                }
              } catch (error) {
                console.error('Error:', error);
                document.getElementById('license-key').textContent = 'Error loading license';
              }

              // Copy button
              document.getElementById('copy-btn').addEventListener('click', function() {
                const licenseKey = document.getElementById('license-key').textContent;
                navigator.clipboard.writeText(licenseKey);
                this.innerHTML = '<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                setTimeout(() => {
                  this.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>';
                }, 2000);
              });
            });
          `
                }}
            />
        </div>
    );
}
