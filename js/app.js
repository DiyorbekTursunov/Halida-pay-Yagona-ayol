document
  .getElementById("form")
  .addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent default form submission

    // Get the submit button
    const submitButton = this.querySelector(".plan-list-btn");
    const originalButtonText = submitButton.textContent;

    // Show loading state
    submitButton.textContent = "Юборилмоқда...";
    submitButton.disabled = true;

    // Collect form data
    const formData = new FormData(this);
    const dataForStorage = {
      name: formData.get("Ism"),
      phone_number: formData.get("Telefon raqam"),
      type: formData.get("Tarif"),
      timestamp: new Date().toISOString(),
    };

    try {
      // Save to localStorage
      localStorage.setItem(
        "formData",
        JSON.stringify(dataForStorage)
      );

      // Redirect to pay.html
      window.location.href = "/payment/";
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      alert("Ma'lumotni saqlashda xatolik yuz berdi. Iltimos, qayta urinib ko‘ring.");
    } finally {
      // Reset button state
      submitButton.textContent = originalButtonText;
      submitButton.disabled = false;
    }
  });
