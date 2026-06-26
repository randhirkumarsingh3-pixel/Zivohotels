const email = "test_mybookings_" + Date.now() + "@example.com";
const password = "Password123!";

async function test() {
  console.log("Signing up...");
  const signup = await fetch("https://zivohotels-api.onrender.com/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email, password, phone: "1234567890" })
  });
  const signupData = await signup.json();
  if (!signupData.success) {
    console.error("Signup failed", signupData);
    return;
  }
  const token = signupData.token;
  console.log("Token received.");

  console.log("Fetching my-bookings...");
  const myBookings = await fetch("https://zivohotels-api.onrender.com/api/v1/bookings/my-bookings", {
    headers: { "Authorization": "Bearer " + token }
  });
  
  console.log("Status:", myBookings.status);
  const text = await myBookings.text();
  console.log("Response:", text);
}
test();
