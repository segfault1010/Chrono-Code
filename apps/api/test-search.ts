async function testSearch() {
  try {
    const res = await fetch("http://localhost:3001/api/repos/c9866d9f-f305-4669-923e-4c2d35adfc4a/search?q=test");
    const json = await res.json();
    console.log("Search response:", json);
  } catch(e) {
    console.error("Error:", e);
  }
}
testSearch();
