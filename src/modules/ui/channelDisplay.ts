type ChannelDisplayArgs = {
    name: string;
    sourceLibraryName?: string | null;
};

export function getChannelNameForDisplay({ name, sourceLibraryName }: ChannelDisplayArgs): string {
    if (!sourceLibraryName) return name;
    const trimmed = sourceLibraryName.trim();
    if (!trimmed) return name;
    const prefix = `${trimmed} - `;
    if (name.startsWith(prefix)) {
        return name.slice(prefix.length);
    }
    return name;
}
