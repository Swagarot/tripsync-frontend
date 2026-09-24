import { useState, useEffect } from "react";
// useState: lets this component hold data that can change over time
//           (here: the health status we get back from Flask)
// useEffect: lets us run code when the component first loads
//            (here: fire off the fetch to Flask as soon as the page opens)

function App() {
  const [status, setStatus] = useState("loading...");
  // status starts as "loading..." until the fetch below finishes,
  // then setStatus updates it — React automatically re-renders when it changes

  useEffect(() => {
    fetch("http://localhost:5000/health")
      .then((response) => response.json()) // parse the JSON body Flask sent back
      .then((data) => setStatus(data.status)) // pull out {"status": "ok"} -> "ok"
      .catch((error) => setStatus("error: backend unreachable"));
      // if Flask isn't running, or CORS blocks it (more on that below),
      // this catches it so the page doesn't just silently break
  }, []); // the empty [] means "only run this once, when the page first loads"
          // — without it, this would refetch on every re-render, in a loop

  return (
    <div>
      <h1>TripSync</h1>
      <p>Backend status: {status}</p>
    </div>
  );
}

export default App;