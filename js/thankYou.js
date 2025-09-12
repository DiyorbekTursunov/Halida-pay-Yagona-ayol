// Ensure the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // Retrieve and parse formData from localStorage
  let formData;
  try {
    formData = JSON.parse(localStorage.getItem("formData"));
  } catch (e) {
    console.error("Error parsing formData from localStorage:", e);
    return;
  }

  // Select DOM elements
  const ism = document.querySelector(".ism");
  const tel = document.querySelector(".tel");
  const tarif = document.querySelector(".tarif");


  // Log formData for debugging
  console.log("formData:", formData);
  console.log("ism element:", formData.name);
  console.log("tel element:", formData.phone_number);

  // Check if elements and formData exist
  if (!formData) {
    console.error("Error: formData is missing or invalid");
    return;
  }
  if (!ism) {
    console.error("Error: Element with class 'ism' not found");
    return;
  }
  if (!tel) {
    console.error("Error: Element with class 'tel' not found");
    return;
  }

  // Set text content
  ism.textContent = formData.name;
  tel.textContent = formData.phone_number;
});
