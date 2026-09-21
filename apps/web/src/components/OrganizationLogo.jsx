import { useState } from "react";

export default function OrganizationLogo({ logo, shortName, className }) {
  const [failedLogo, setFailedLogo] = useState(null);
  return logo && failedLogo !== logo
    ? <img src={logo} alt="" aria-hidden="true" className={className} onError={() => setFailedLogo(logo)} style={{ width: 44, height: 44, objectFit: "contain", background: "white", padding: 3, boxSizing: "border-box" }} />
    : <span className={className} aria-hidden="true">{shortName}</span>;
}
