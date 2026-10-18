import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#D96B43",
          borderRadius: "22%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 256,
          fontWeight: 800,
          color: "#F5EFE6",
        }}
      >
        M
      </div>
    ),
    size,
  );
}
