## Architectural Evolution: From Monolith to Worker-Based System

### Original Architecture (Before)

Initially, the `spike_indexer` was structured as a Next.js application where the web server, the blockchain event poller, and all scheduled data processing tasks (like updating AMM data, OHLC, etc.) ran together within a **single Node.js process**.

**Problems with the Original Architecture:**
This "all-in-one" approach, while simple to set up, led to inefficiencies. Long-running or CPU-intensive indexing tasks could block the main Node.js event loop, making the entire application (including any potential UI or API responses) slow and unresponsive. It also made scaling difficult, as you couldn't independently scale the web part from the indexing part.

### New Architecture (Now)

The `spike_indexer` has been transformed into a dedicated, robust backend service with a **worker-based architecture**, managed by PM2. The key change is the separation of concerns into independent processes:

1.  **Poller Worker:**
    *   **Role:** This worker's sole responsibility is to **fetch new events from the Supra blockchain**. It continuously polls for new blocks and extracts relevant events.
    *   **Interaction:** Instead of processing these events directly, the Poller Worker now **adds them as "jobs" to a local SQLite job queue**.

2.  **Processor Worker:**
    *   **Role:** This worker's job is to **process the events** that the Poller Worker has added to the queue. It continuously pulls jobs from the queue, executes the necessary processing logic (like `processEvents`, `executeGetReservesForAllPairs`, `executeProcessOHLC`, etc.), and then saves the processed data to your main PostgreSQL database. It also handles the scheduled tasks that were previously run by `node-cron`.
    *   **Interaction:** It reads from the SQLite job queue and writes to your main PostgreSQL database.

3.  **SQLite Job Queue:**
    *   **Role:** This is a new, lightweight local database (`queue.db`) that acts as a **communication bridge** between the Poller and Processor Workers.
    *   **Benefits:**
        *   **Decoupling:** The Poller and Processor can operate independently. If the Processor is busy or temporarily down, the Poller can continue fetching events and adding them to the queue without interruption.
        *   **Persistence:** If either worker crashes, the jobs in the queue are not lost. They remain in the SQLite database and will be picked up when the workers restart.
        *   **No Impact on Main DB:** This queue is entirely separate from your main PostgreSQL database.

---

### Data Standardization: Canonical Token Order and Volume Calculation

A critical improvement in the new architecture is the standardization of analytical data, particularly for OHLC (Open, High, Low, Close) information. This ensures that metrics like volume and APR are calculated consistently and accurately across all trading pairs.

#### Canonical Token Order

To remove ambiguity, the system now enforces a strict, predictable order for tokens within any given pair for analytical purposes. When OHLC data is generated, pairs are organized into a `token0` and `token1` based on the following hierarchy of rules, managed by an `AnchorToken` table in the database:

1.  **Primary Reference Token (e.g., SUPRA):** If SUPRA is in the pair, it is **always `token0`**.
2.  **Stablecoins (e.g., USDT, USDC):** If there is no SUPRA but there is a stablecoin, the stablecoin is **always `token0`**.
3.  **Alphabetical Order:** If neither token is an anchor, they are sorted alphabetically by their contract address. The first one becomes `token0`.

This ensures that for any pair, we always know which token is the "base" (`token0`) and which is the "quote" (`token1`).

#### Standardized Volume Calculation

The most significant change is how trading volume is calculated and stored.

*   **The Problem:** Raw trading volume is ambiguous. A trade of 1 SUPRA for 50,000 MEME has a volume of "1 SUPRA" from one perspective and "50,000 MEME" from another. Simply summing the input amounts of trades results in a meaningless mix of different token units.
*   **The Solution:** The `ohlc-aggregator` now standardizes all volume calculations. For every trade, the volume is converted to its equivalent value in the **canonical `token1`** of the pair.

**Practical Example:**
*   For a `MEME/SUPRA` pair, the canonical order is `token0=SUPRA`, `token1=MEME`. All volume is calculated and stored in **MEME**.
*   For a `MEME/USDT` pair, the canonical order is `token0=USDT`, `token1=MEME`. All volume is calculated and stored in **MEME**.

This guarantees that the `volume` field in the `OhlcData` table always represents a consistent unit (`token1`), allowing downstream processes like the `data-fetcher` to reliably convert it to USD by multiplying it with the price of `token1`.

---

### Operational Behavior: Improved Efficiency and Reliability

*   **Core Functionality:** The system still performs the exact same core tasks: it fetches blockchain events, processes them (e.g., handles trades, updates AMM data, calculates OHLC), and stores the results in your main database. The data being indexed and the final state in your database should be identical to what it was before.
*   **Performance:** By separating the heavy lifting into dedicated workers, the system is now much more efficient. The polling and processing tasks won't interfere with each other.
*   **Reliability:** If one worker encounters an error and crashes, PM2 will automatically restart it, and the other worker can continue its job. Crucially, no events will be lost thanks to the persistent job queue.
*   **Scalability:** In the future, you can easily run multiple instances of the Processor Worker to handle a higher volume of events from the queue.
*   **Management:** You now manage the indexer purely via command-line scripts (`npm run start:indexer`, `npm run stop:indexer`, `npm run logs:indexer`), eliminating the need for a UI for operational control.

### How to Run the Indexer

You can now manage the indexer using the following commands:

*   **Start the indexer:**
    ```bash
    npm run start:indexer
    ```
*   **Stop the indexer:**
    ```bash
    npm run stop:indexer
    ```
*   **Restart the indexer:**
    ```bash
    npm run restart:indexer
    ```
*   **View the logs:**
    ```bash
    npm run logs:indexer
    ```