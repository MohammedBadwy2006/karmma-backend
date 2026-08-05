// routes/payment.js
// ملف Router منفصل - هتعمله require في app.js أو server.js الموجود عندك
// مش محتاج app.listen جديد ولا سيرفر جديد، هو هيشتغل جوه الباك اند بتاعك

const express = require('express');
const axios = require('axios');
const router = express.Router();

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const IFRAME_ID = process.env.PAYMOB_IFRAME_ID;
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET; // من لوحة تحكم Paymob

const BASE_URL = 'https://accept.paymob.com/api';

// ---------- إنشاء عملية دفع جديدة ----------
router.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency, billingData, orderId } = req.body;
    // amount المفروض يوصل بالقرش (100 جنيه = 10000)

    const authResponse = await axios.post(`${BASE_URL}/auth/tokens`, {
      api_key: PAYMOB_API_KEY,
    });
    const authToken = authResponse.data.token;

    const orderResponse = await axios.post(`${BASE_URL}/ecommerce/orders`, {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amount,
      currency: currency || 'EGP',
      merchant_order_id: orderId,
      items: [],
    });
    const paymobOrderId = orderResponse.data.id;

    const paymentKeyResponse = await axios.post(`${BASE_URL}/acceptance/payment_keys`, {
      auth_token: authToken,
      amount_cents: amount,
      expiration: 3600,
      order_id: paymobOrderId,
      billing_data: {
        first_name: billingData.firstName || 'NA',
        last_name: billingData.lastName || 'NA',
        email: billingData.email || 'na@na.com',
        phone_number: billingData.phone || 'NA',
        apartment: 'NA',
        floor: 'NA',
        street: 'NA',
        building: 'NA',
        city: 'NA',
        country: 'NA',
        state: 'NA',
      },
      currency: currency || 'EGP',
      integration_id: INTEGRATION_ID,
    });
    const paymentToken = paymentKeyResponse.data.token;

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${IFRAME_ID}?payment_token=${paymentToken}`;

    res.json({ success: true, paymentUrl: iframeUrl, paymobOrderId });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'حصل خطأ أثناء إنشاء عملية الدفع' });
  }
});

// ---------- Webhook: Paymob بيبعتلك عليه بعد ما الدفع يخلص ----------
const crypto = require('crypto');

router.post('/paymob-webhook', (req, res) => {
  try {
    const { obj } = req.body;
    const receivedHmac = req.query.hmac; // Paymob بيبعت الـ HMAC كـ query param

    // ترتيب الحقول ده مهم جداً - لازم يكون بنفس الترتيب اللي في docs.paymob.com
    const hmacFields = [
      obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
      obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
      obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
      obj.is_voided, obj.order.id, obj.owner, obj.pending,
      obj.source_data.pan, obj.source_data.sub_type, obj.source_data.type,
      obj.success,
    ].join('');

    const calculatedHmac = crypto
      .createHmac('sha512', PAYMOB_HMAC_SECRET)
      .update(hmacFields)
      .digest('hex');

    if (calculatedHmac !== receivedHmac) {
      console.warn('HMAC mismatch - رفض الطلب، ممكن يكون مزور');
      return res.sendStatus(401);
    }

    const merchantOrderId = obj.order.merchant_order_id;

    if (obj.success) {
      // حدّث حالة الأوردر في الداتابيز بتاعتك لـ "مدفوع"
      console.log(`Order ${merchantOrderId} paid successfully`);
      // مثال: await Order.updateOne({ _id: merchantOrderId }, { status: 'paid' });
    } else {
      console.log(`Order ${merchantOrderId} payment failed`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

module.exports = router;