import { act } from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the Nano Aakriti storefront and chat entry point", async () => {
  await act(async () => {
    render(<App />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(screen.getAllByRole("img", { name: /nano aakriti/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /chat with us/i })).toBeInTheDocument();
});
