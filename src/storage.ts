import { defaultData } from "./data";
import type { AppData } from "./types";

const DATABASE = "mogu-novel-studio";
const STORE = "app-state";
const KEY = "primary";
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const loadData = async (): Promise<AppData> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE, "readonly")
      .objectStore(STORE)
      .get(KEY);
    request.onsuccess = () =>
      resolve(
        request.result
          ? (request.result as AppData)
          : structuredClone(defaultData),
      );
    request.onerror = () => reject(request.error);
  });
};

export const saveData = async (data: AppData): Promise<void> => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(data, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const exportData = (data: AppData) => {
  // API keys are device credentials, not portable project data.
  const exportable: AppData = {
    ...data,
    settings: {
      ...data.settings,
      providers: data.settings.providers.map((provider) => ({
        ...provider,
        apiKey: "",
      })),
    },
  };
  const blob = new Blob([JSON.stringify(exportable, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `墨构备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const parseImport = async (
  file: File,
  current?: AppData,
): Promise<AppData> => {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("备份文件超过 25 MB，无法导入");
  }
  let data: Partial<AppData>;
  try {
    data = JSON.parse(await file.text()) as Partial<AppData>;
  } catch {
    throw new Error("备份文件不是有效的 JSON");
  }
  const settings = data.settings;
  if (
    data.version !== 1 ||
    !Array.isArray(data.projects) ||
    !settings ||
    !Array.isArray(settings.providers)
  ) {
    throw new Error("备份文件格式不正确");
  }
  if (
    !data.projects.every(
      (project) =>
        isRecord(project) &&
        typeof project.id === "string" &&
        Array.isArray(project.chapters) &&
        project.chapters.every(
          (chapter) => isRecord(chapter) && typeof chapter.id === "string",
        ),
    )
  ) {
    throw new Error("备份文件中的作品数据不完整");
  }
  const providers = settings.providers.filter(
    (provider): provider is AppData["settings"]["providers"][number] =>
      isRecord(provider),
  );
  if (!providers.length) throw new Error("备份文件中没有可用的 AI 提供商");
  const existingProviders = new Map(
    (current?.settings.providers ?? []).map((provider) => [
      provider.id,
      provider,
    ]),
  );
  return {
    ...data,
    settings: {
      ...settings,
      providers: providers.map((provider) => {
        const id = String(provider.id || "custom");
        const baseUrl = String(provider.baseUrl || "");
        const existing = existingProviders.get(id);
        return {
          ...provider,
          id,
          name: String(provider.name || id || "自定义模型"),
          baseUrl,
          // Backups intentionally contain blank keys; keep credentials already
          // stored on this device only when the endpoint is unchanged.
          apiKey:
            existing?.baseUrl.trim() === baseUrl.trim() ? existing.apiKey : "",
          model: String(provider.model || ""),
          enabled: provider.enabled !== false,
          breakArmorPrompt:
            typeof provider.breakArmorPrompt === "string"
              ? provider.breakArmorPrompt
              : "",
        };
      }),
    },
  } as AppData;
};
