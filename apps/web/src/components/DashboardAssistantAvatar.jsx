import { useState } from "react";
import nellieAvatar from "@/assets/nellie-ju-v1.png";
import "./DashboardAssistantAvatar.css";

export default function DashboardAssistantAvatar({ avatar = "dolphin" }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  if (avatar !== "compass" && !imageUnavailable) {
    return <img className="dashboard-assistant-avatar" src={nellieAvatar} width="64" height="64"
      alt="" aria-hidden="true" decoding="async" onError={() => setImageUnavailable(true)} />;
  }
  return <svg className="dashboard-assistant-avatar" viewBox="0 0 80 80" width="64" height="64" aria-hidden="true" focusable="false">
    <circle cx="40" cy="40" r="38" fill="#dcf3ed" />
    <circle cx="40" cy="40" r="25" fill="white" stroke="#086a58" strokeWidth="2" />
    <path d="m50 27-5 18-18 8 8-20Z" fill="#0c806b" />
    <path d="m50 27-10 13-13 13 8-20Z" fill="#9ed4c6" />
    <circle cx="40" cy="40" r="3" fill="white" />
  </svg>;
}
