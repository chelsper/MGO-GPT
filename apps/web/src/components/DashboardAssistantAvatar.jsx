export default function DashboardAssistantAvatar({ avatar = "dolphin" }) {
  return <svg viewBox="0 0 80 80" width="64" height="64" aria-hidden="true" focusable="false">
    <circle cx="40" cy="40" r="38" fill="#dcf3ed" />
    {avatar === "compass" ? <>
      <circle cx="40" cy="40" r="25" fill="white" stroke="#086a58" strokeWidth="2" />
      <path d="m50 27-5 18-18 8 8-20Z" fill="#0c806b" />
      <path d="m50 27-10 13-13 13 8-20Z" fill="#9ed4c6" />
      <circle cx="40" cy="40" r="3" fill="white" />
    </> : <>
      <path d="M14 49c6-3 10-6 14-13 4-8 10-14 20-14l-2-8c8 2 12 7 13 12 8 6 11 14 10 21l7 5c-6 3-12 2-17-1-6-4-10-6-17-3l-4 12-5-9c-6 5-12 6-18 5l-7 7-2-11Z" fill="#5cafa4" stroke="#075e50" strokeWidth="2" strokeLinejoin="round" />
      <path d="M35 45c8-7 19-8 25 2-7-3-15-2-25 4" fill="#f5fbf9" />
      <circle cx="58" cy="35" r="2.5" fill="#113e37" />
      <path d="M13 67c14 5 28 5 42 0" fill="none" stroke="#84c9bc" strokeWidth="2" strokeLinecap="round" />
    </>}
  </svg>;
}
