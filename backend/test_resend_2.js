import { Resend } from 'resend';
const resend = new Resend('re_5aMVgoS9_Hzpv1ykUA3unMjYPEvn3F18R');

async function test() {
  try {
    const data = await resend.emails.send({
      from: 'accounts@zivohotels.com',
      to: 'test@example.com',
      subject: 'Test',
      html: '<strong>Test</strong>',
    });
    console.log("Success:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
