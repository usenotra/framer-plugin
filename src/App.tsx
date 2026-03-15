import "./App.css";

import { framer, type ManagedCollection } from "framer-plugin";
import { useEffect, useLayoutEffect, useState } from "react";
import { FieldMapping } from "./components/field-mapping";
import { SelectDataSource } from "./components/select-data-source";
import { type DataSource, getDataSource, setStoredApiKey } from "./util/data";

interface AppProps {
  collection: ManagedCollection;
  previousApiKey: string | null;
  previousDataSourceId: string | null;
  previousSlugFieldId: string | null;
}

export function App({
  collection,
  previousApiKey,
  previousDataSourceId,
  previousSlugFieldId,
}: AppProps) {
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const canLoadPrevious =
    Boolean(previousDataSourceId) && Boolean(previousApiKey?.trim());
  const [isLoadingDataSource, setIsLoadingDataSource] =
    useState(canLoadPrevious);

  useLayoutEffect(() => {
    const hasDataSourceSelected = Boolean(dataSource);

    framer.showUI({
      width: hasDataSourceSelected ? 360 : 260,
      height: hasDataSourceSelected ? 520 : 340,
      minWidth: hasDataSourceSelected ? 360 : undefined,
      minHeight: hasDataSourceSelected ? 520 : undefined,
      resizable: hasDataSourceSelected,
    });
  }, [dataSource]);

  useEffect(() => {
    if (!(previousDataSourceId && previousApiKey?.trim())) {
      return;
    }

    const abortController = new AbortController();

    setIsLoadingDataSource(true);
    getDataSource(previousApiKey, previousDataSourceId, abortController.signal)
      .then(setDataSource)
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        framer.notify(
          `Error loading previously configured data source “${previousDataSourceId}”. Check the logs for more details.`,
          {
            variant: "error",
          }
        );
      })
      .finally(() => {
        if (abortController.signal.aborted) {
          return;
        }

        setIsLoadingDataSource(false);
      });

    return () => abortController.abort();
  }, [previousDataSourceId, previousApiKey]);

  if (isLoadingDataSource) {
    return (
      <main className="loading">
        <div className="framer-spinner" />
      </main>
    );
  }

  if (!dataSource) {
    return (
      <SelectDataSource
        onSelectDataSource={async (ds, apiKey) => {
          await setStoredApiKey(collection, apiKey);
          setDataSource(ds);
        }}
      />
    );
  }

  return (
    <FieldMapping
      collection={collection}
      dataSource={dataSource}
      initialSlugFieldId={previousSlugFieldId}
    />
  );
}
