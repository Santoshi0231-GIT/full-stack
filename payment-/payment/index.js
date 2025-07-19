const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const axios = require('axios');

require('dotenv').config();

// Initialize Express app
const app = express();
app.use(express.json());

// Environment validation
function validateEnvironmentVariables() {
    const requiredEnvVars = [
        'BASE_URL',
        'ESEWA_MERCHANT_CODE',
        'ESEWA_SECRET_KEY',
        'KHALTI_SECRET_KEY', // Added this based on your code's usage
    ];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing environment variable: ${envVar}`);
        }
    }
}

// eSewa signature generation
function generateEsewaSignature(secretKey, message) {
    return crypto.createHmac('sha256', secretKey)
        .update(message)
        .digest('base64');
}

// Route for the root path (/)
// This will respond to GET requests at http://localhost:3000/
app.get('/', (req, res) => {
    console.log("Received GET request to /");
    res.status(200).send('Welcome to the payment API!');
});

// New route for /api/index
// This will respond to GET requests at http://localhost:3000/api/index
app.get('/api/index', (req, res) => {
    console.log("Received GET request to /api/index");
    res.status(200).json({ message: 'This is the /api/index endpoint!' });
});


// Payment endpoint
// This handles POST requests to http://localhost:3000/api/checkout-session
app.post('/api/checkout-session', async (req, res) => {
    console.log("Received POST request to /api/checkout-session");

    try {
        validateEnvironmentVariables();
        const paymentData = req.body;
        console.log("Payment data received:", paymentData);
        const { amount, productName, transactionId, method } = paymentData;

        if (!amount || !productName || !transactionId || !method) {
            console.error("Missing required fields:", paymentData);
            return res.status(400).json({ error: "Missing required fields" });
        }

        switch (method) {
            case "esewa": {
                console.log("Initiating eSewa payment");
                const transactionUuid = `${Date.now()}-${uuidv4()}`;

                const esewaConfig = {
                    amount: amount,
                    tax_amount: "0",
                    total_amount: amount,
                    transaction_uuid: transactionUuid,
                    product_code: process.env.ESEWA_MERCHANT_CODE,
                    product_service_charge: "0",
                    product_delivery_charge: "0",
                    success_url: `${process.env.BASE_URL}/success?method=esewa`,
                    failure_url: `${process.env.BASE_URL}`,
                    signed_field_names: "total_amount,transaction_uuid,product_code",
                };

                const signatureString = `total_amount=${esewaConfig.total_amount},transaction_uuid=${esewaConfig.transaction_uuid},product_code=${esewaConfig.product_code}`;
                const signature = generateEsewaSignature(
                    process.env.ESEWA_SECRET_KEY,
                    signatureString
                );

                console.log("eSewa config:", { ...esewaConfig, signature });

                return res.json({
                    amount: amount,
                    esewaConfig: {
                        ...esewaConfig,
                        signature,
                        product_service_charge: Number(esewaConfig.product_service_charge),
                        product_delivery_charge: Number(esewaConfig.product_delivery_charge),
                        tax_amount: Number(esewaConfig.tax_amount),
                        total_amount: Number(esewaConfig.total_amount),
                    },
                });
            }

            case "khalti": {
                console.log("Initiating Khalti payment");
                const khaltiConfig = {
                    return_url: `${process.env.BASE_URL}/success?method=khalti`,
                    website_url: process.env.BASE_URL,
                    amount: Math.round(parseFloat(amount) * 100),
                    purchase_order_id: transactionId,
                    purchase_order_name: productName,
                    customer_info: {
                        name: "dai",
                        email: "dai@gmail.com",
                        phone: "9800000000",
                    },
                };

                try {
                    const response = await axios.post(
                        "https://a.khalti.com/api/v2/epayment/initiate/",
                        khaltiConfig,
                        {
                            headers: {
                                Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
                                "Content-Type": "application/json",
                            },
                        }
                    );

                    console.log("Khalti payment initiated:", response.data);
                    return res.json({
                        khaltiPaymentUrl: response.data.payment_url,
                    });
                } catch (error) {
                    console.error("Khalti API Error:", error.response?.data || error.message);
                    throw new Error(
                        `Khalti payment initiation failed: ${JSON.stringify(error.response?.data || error.message)}`
                    );
                }
            }

            default:
                console.error("Invalid payment method:", method);
                return res.status(400).json({ error: "Invalid payment method" });
        }
    } catch (err) {
        console.error("Payment API Error:", err);
        return res.status(500).json({
            error: "Error creating payment session",
            details: err instanceof Error ? err.message : "Unknown error",
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;