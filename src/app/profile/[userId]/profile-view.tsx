"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  PROFILE_ENTERTAINMENT,
  PROFILE_FOOD,
  PROFILE_MISC,
  PROFILE_PIVOT,
  type ProfileField,
} from "@/lib/profile-fields";
import { safeProfilePictureSrc } from "@/lib/url-safety";

export type ProfileViewData = {
  display_name: string;
  email: string;
  birthday: string | null;
  profile_modified_at: string | null;
  picture_url: string;
  caption: string;
  height: string;
  shoe_size: string;
  pants_size: string;
  shirt_size: string;
  [key: string]: string | null;
};

type TabId = "basics" | "about" | "food" | "entertainment" | "pivot";

function profileTabs(aboutLabel: string): { id: TabId; label: string }[] {
  return [
    { id: "basics", label: "Basics" },
    { id: "about", label: aboutLabel },
    { id: "food", label: "Food" },
    { id: "entertainment", label: "Entertainment" },
    { id: "pivot", label: "Bernard Pivot" },
  ];
}

const toolbarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  background: "var(--page)",
  border: "1px solid var(--border, #000)",
  marginBottom: 12,
  padding: 10,
};

const tabRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 10px",
    border: active ? "1px solid var(--pine-deep)" : "1px solid #666",
    background: active ? "var(--navy)" : "#f0f0f0",
    color: active ? "#fff" : "#000",
    cursor: "pointer",
  };
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 220px) 1fr",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #e5e5e5",
      }}
    >
      <div style={{ fontWeight: 700, color: "#333" }}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap", color: "#000" }}>
        {children || "\u00a0"}
      </div>
    </div>
  );
}

function QuestionFacts({
  fields,
  data,
}: {
  fields: ProfileField[];
  data: ProfileViewData;
}) {
  return (
    <div style={{ padding: "4px 16px 16px" }}>
      {fields.map((f) => (
        <Fact key={f.key} label={f.label}>
          {String(data[f.column] ?? "") || "—"}
        </Fact>
      ))}
    </div>
  );
}

export function ProfileView({
  data,
  birthdayLabel,
  modifiedLabel,
  isSelf,
}: {
  data: ProfileViewData;
  birthdayLabel: string;
  modifiedLabel: string;
  /** Own profile → "About you"; someone else's → "About them". */
  isSelf: boolean;
}) {
  const [tab, setTab] = useState<TabId>("basics");
  const aboutLabel = isSelf ? "About you" : "About them";
  const tabs = profileTabs(aboutLabel);

  return (
    <div style={{ maxWidth: 720, marginTop: 8 }}>
      <div style={toolbarStyle}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
          {data.display_name}&apos;s profile
        </div>
        <div style={tabRowStyle} role="tablist" aria-label="Profile sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`view-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`view-panel-${t.id}`}
              style={tabStyle(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="view-panel-basics"
        role="tabpanel"
        aria-labelledby="view-tab-basics"
        hidden={tab !== "basics"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Account</div>
        <div style={{ padding: "4px 16px 16px" }}>
          <Fact label="Last modified">{modifiedLabel}</Fact>
          <Fact label="Name">{data.display_name}</Fact>
          <Fact label="E-mail">{data.email}</Fact>
          <Fact label="Birthday">{birthdayLabel}</Fact>
        </div>

        <div className="panel-head">Photo</div>
        <div style={{ padding: 16 }}>
          {safeProfilePictureSrc(data.picture_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeProfilePictureSrc(data.picture_url)!}
              alt=""
              width={280}
              style={{
                maxWidth: "100%",
                border: "1px solid #ccc",
                display: "block",
                marginBottom: data.caption ? 8 : 0,
              }}
            />
          ) : (
            <p style={{ margin: 0, color: "#555" }}>No photo yet.</p>
          )}
          {data.caption ? (
            <p style={{ margin: "8px 0 0", fontStyle: "italic", color: "#333" }}>
              {data.caption}
            </p>
          ) : null}
        </div>

        <div className="panel-head">Sizes</div>
        <div style={{ padding: "4px 16px 16px" }}>
          <Fact label="Height">{data.height || "—"}</Fact>
          <Fact label="Shoe size">{data.shoe_size || "—"}</Fact>
          <Fact label="Pants size">{data.pants_size || "—"}</Fact>
          <Fact label="Shirt size">{data.shirt_size || "—"}</Fact>
        </div>
      </div>

      <div
        id="view-panel-about"
        role="tabpanel"
        aria-labelledby="view-tab-about"
        hidden={tab !== "about"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">{aboutLabel}</div>
        <QuestionFacts fields={PROFILE_MISC} data={data} />
      </div>

      <div
        id="view-panel-food"
        role="tabpanel"
        aria-labelledby="view-tab-food"
        hidden={tab !== "food"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Food favorites</div>
        <QuestionFacts fields={PROFILE_FOOD} data={data} />
      </div>

      <div
        id="view-panel-entertainment"
        role="tabpanel"
        aria-labelledby="view-tab-entertainment"
        hidden={tab !== "entertainment"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Entertainment & sports</div>
        <QuestionFacts fields={PROFILE_ENTERTAINMENT} data={data} />
      </div>

      <div
        id="view-panel-pivot"
        role="tabpanel"
        aria-labelledby="view-tab-pivot"
        hidden={tab !== "pivot"}
        className="panel"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div className="panel-head">Bernard Pivot wants to know…</div>
        <QuestionFacts fields={PROFILE_PIVOT} data={data} />
      </div>
    </div>
  );
}
