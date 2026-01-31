import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'SlotHunter - Get Your License',
    description: 'Purchase SlotHunter license to automate visa slot hunting',
};

export default function PaymentPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-4">
                        SlotHunter
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Automate your visa slot hunting. Never miss a slot again.
                    </p>
                </div>

                {/* Pricing Cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    {/* Monthly */}
                    <PricingCard
                        plan="MONTHLY"
                        price="Rp 49.000"
                        period="/bulan"
                        features={[
                            'Unlimited slot checks',
                            'Auto-booking',
                            'Email notifications',
                            '1 device'
                        ]}
                    />

                    {/* Annual - Popular */}
                    <PricingCard
                        plan="ANNUAL"
                        price="Rp 149.000"
                        period="/tahun"
                        popular
                        features={[
                            'Everything in Monthly',
                            'Priority support',
                            '2 devices',
                            'Save 75%'
                        ]}
                    />

                    {/* Lifetime */}
                    <PricingCard
                        plan="LIFETIME"
                        price="Rp 299.000"
                        period="sekali bayar"
                        features={[
                            'Everything in Annual',
                            'Lifetime updates',
                            '3 devices',
                            'VIP Discord access'
                        ]}
                    />
                </div>

                {/* Payment Form */}
                <PaymentForm />

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-12">
                    Secure payment powered by Midtrans. 30-day money back guarantee.
                </p>
            </div>
        </div>
    );
}

function PricingCard({
    plan,
    price,
    period,
    features,
    popular = false
}: {
    plan: string;
    price: string;
    period: string;
    features: string[];
    popular?: boolean;
}) {
    return (
        <div
            className={`relative rounded-2xl p-6 ${popular
                    ? 'bg-gradient-to-b from-emerald-500/20 to-cyan-500/20 border-2 border-emerald-500/50'
                    : 'bg-gray-800/50 border border-gray-700'
                }`}
        >
            {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    POPULAR
                </div>
            )}
            <h3 className="text-lg font-semibold text-gray-300 mb-2">{plan}</h3>
            <div className="mb-4">
                <span className="text-3xl font-bold">{price}</span>
                <span className="text-gray-400 text-sm ml-1">{period}</span>
            </div>
            <ul className="space-y-2 mb-6">
                {features.map((feature, i) => (
                    <li key={i} className="flex items-center text-sm text-gray-300">
                        <svg className="w-4 h-4 mr-2 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {feature}
                    </li>
                ))}
            </ul>
            <button
                type="button"
                data-plan={plan}
                className={`w-full py-2 rounded-lg font-semibold transition select-plan-btn ${popular
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
            >
                Select {plan}
            </button>
        </div>
    );
}

function PaymentForm() {
    return (
        <div className="bg-gray-800/50 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold mb-6">Complete Your Purchase</h2>

            <form id="payment-form" className="space-y-4">
                <input type="hidden" name="planType" id="planType" value="LIFETIME" />

                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                        Full Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                        placeholder="John Doe"
                    />
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                        Email Address
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                        placeholder="john@example.com"
                    />
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        id="pay-button"
                        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold rounded-lg text-lg transition transform hover:scale-[1.02]"
                    >
                        🚀 Pay Now - Rp 299.000
                    </button>
                </div>

                <p id="error-message" className="text-red-400 text-sm hidden"></p>
            </form>

            {/* Client-side script */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
            document.addEventListener('DOMContentLoaded', function() {
              const form = document.getElementById('payment-form');
              const payButton = document.getElementById('pay-button');
              const planInput = document.getElementById('planType');
              const errorMessage = document.getElementById('error-message');
              
              const prices = {
                MONTHLY: 'Rp 49.000',
                ANNUAL: 'Rp 149.000',
                LIFETIME: 'Rp 299.000'
              };

              // Plan selection
              document.querySelectorAll('.select-plan-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                  const plan = this.dataset.plan;
                  planInput.value = plan;
                  payButton.textContent = '🚀 Pay Now - ' + prices[plan];
                  
                  // Highlight selected
                  document.querySelectorAll('.select-plan-btn').forEach(b => {
                    b.classList.remove('ring-2', 'ring-emerald-400');
                  });
                  this.classList.add('ring-2', 'ring-emerald-400');
                });
              });

              // Form submission
              form.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                payButton.disabled = true;
                payButton.textContent = 'Processing...';
                errorMessage.classList.add('hidden');
                
                const formData = new FormData(form);
                const data = {
                  planType: formData.get('planType'),
                  email: formData.get('email'),
                  name: formData.get('name')
                };

                try {
                  const response = await fetch('/api/payment/create-mock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                  });

                  const result = await response.json();

                  if (result.success) {
                    // Redirect to mock success
                    window.location.href = result.data.redirectUrl;
                  } else {
                    throw new Error(result.error || 'Payment failed');
                  }
                } catch (error) {
                  errorMessage.textContent = error.message;
                  errorMessage.classList.remove('hidden');
                  payButton.disabled = false;
                  payButton.textContent = '🚀 Pay Now - ' + prices[planInput.value];
                }
              });
            });
          `
                }}
            />
        </div>
    );
}
