import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import type { City } from "@/domain/types";

const origin: City = {
  code: "LHR",
  name: "London",
  utcOffsetMin: 60,
  lat: 51.5,
  lon: -0.12,
};

const destination: City = {
  code: "HND",
  name: "Tokyo",
  utcOffsetMin: 540,
  lat: 35.6,
  lon: 139.7,
};

describe("TimezoneClocks (SSR)", () => {
  test("renders home and destination city labels and difference (eastbound)", () => {
    const html = renderToStaticMarkup(
      <TimezoneClocks origin={origin} destination={destination} requiredShiftMin={-480} />
    );
    expect(html).toContain("London (Home)");
    expect(html).toContain("Tokyo");
    expect(html).toContain("8.0h ahead");
  });

  test("renders behind for westbound travel", () => {
    const html = renderToStaticMarkup(
      <TimezoneClocks origin={destination} destination={origin} requiredShiftMin={480} />
    );
    expect(html).toContain("Tokyo (Home)");
    expect(html).toContain("London");
    expect(html).toContain("8.0h behind");
  });
});
