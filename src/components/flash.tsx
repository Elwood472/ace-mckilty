export function Flash({
  error,
  ok,
}: {
  error?: string;
  ok?: string;
}) {
  if (!error && !ok) return null;
  if (error) {
    return (
      <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  return (
    <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-moss">
      {ok}
    </p>
  );
}
