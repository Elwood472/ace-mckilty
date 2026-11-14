import Link from "next/link";

export function HomeToolbar({
  myListId,
  userId,
}: {
  myListId: string;
  userId: string;
}) {
  const items: { href: string; label: string }[] = [
    { href: "/profile/edit", label: "Edit profile" },
    { href: `/profile/${userId}`, label: "View profile" },
    { href: `/lists/${myListId}`, label: "Add a gift" },
    { href: `/lists/${myListId}`, label: "My gifts" },
    { href: "/bought", label: "Gifts I bought" },
    { href: "/removed", label: "Gifts I removed" },
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
