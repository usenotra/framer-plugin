import { DatabaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { framer } from "framer-plugin";
import { useState } from "react";
import {
  type DataSource,
  dataSourceOptions,
  getDataSource,
} from "../util/data";

interface SelectDataSourceProps {
  onSelectDataSource: (dataSource: DataSource, apiKey: string) => void;
}

export function SelectDataSource({
  onSelectDataSource,
}: SelectDataSourceProps) {
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string>(
    dataSourceOptions[0].id
  );
  const [apiKey, setApiKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsLoading(true);

      const dataSource = await getDataSource(
        apiKey.trim(),
        selectedDataSourceId
      );
      onSelectDataSource(dataSource, apiKey.trim());
    } catch (error) {
      console.error(error);
      framer.notify(
        `Failed to load data source “${selectedDataSourceId}”. Check the logs for more details.`,
        {
          variant: "error",
        }
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="framer-hide-scrollbar setup">
      <div className="intro">
        <div className="logo">
          <HugeiconsIcon
            aria-label="Collection icon"
            className="logo-mark"
            icon={DatabaseIcon}
            size={20}
            strokeWidth={1.6}
          />
        </div>
        <div className="content">
          <h2>Notra</h2>
          <p>Import content from Notra into your Framer collection.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <label htmlFor="apiKey">
          <span>API Key</span>
          <input
            autoComplete="off"
            id="apiKey"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Enter your API key"
            type="password"
            value={apiKey}
          />
          <span className="api-key-hint">
            Get your API key from the{" "}
            <a
              href="https://app.usenotra.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              Notra dashboard
            </a>
            .
          </span>
        </label>
        <label htmlFor="dataSource">
          <span>Content Type</span>
          <select
            id="dataSource"
            onChange={(event) => setSelectedDataSourceId(event.target.value)}
            value={selectedDataSourceId}
          >
            <option disabled value="">
              Choose content type…
            </option>
            {dataSourceOptions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!(selectedDataSourceId && apiKey.trim()) || isLoading}
          type="submit"
        >
          {isLoading ? <div className="framer-spinner" /> : "Next"}
        </button>
      </form>
    </main>
  );
}
