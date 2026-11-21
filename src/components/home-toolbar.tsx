import Link from "next/link";

export function HomeToolbar({
  myListId,
  userId,
}: {
  myListId: string;
  userId: string;
}) {
  const items: { href: string; label: string }[] = [
    { href: `/profile/${userId}`, label: "My profile" },
    { href: `/lists/${myListId}`, label: "My gifts" },
  ];

  return (
    <nav className="home-toolbar" aria-label="My shortcuts">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`}>
          {i > 0 ? <span className="home-toolbar-sep">·</span> : null}
          <Link href={item.href}>{item.label}</Link>
        </span>
      ))}
    </nav>
  );
}
