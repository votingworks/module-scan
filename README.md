# Scan Module

This web server component provides a web interface to a scanner

## Install Requisite Software

```sh
# install application packages
yarn install

# install external tools
make install
```

## Run Tests

```sh
yarn test
```

## Start the Server

```sh
# use a real scanner
yarn start
```

## Mock Scanning

You can also scan directly from image files instead of using a real scanner:

```sh
# single batch with single sheet
MOCK_SCANNER_FILES=front.png,back.png yarn start

# single batch with multiple sheets
MOCK_SCANNER_FILES=front-01.png,back-01.png,front-02.png,back-02.png yarn start

# multiple batches with one sheet each (note ",," batch separator)
MOCK_SCANNER_FILES=front-01.png,back-01.png,,front-02.png,back-02.png yarn start

# use a manifest file
cat <<EOS > manifest
# first batch (this is a comment)
front-01.png
back-01.png

# second batch
front-02.png
back-02.png
EOS
MOCK_SCANNER_FILES=@manifest yarn start
```

## API Documentation

This scanner module provides the following API:

- `GET /scan/status` returns status information:

  ```
  {"batches": [
      {
       "id": <batchId>,
       "count": <count>,
       "startedAt: <startedAt>,
       "endedAt": <endedAt>
      }
   ]
  }
  ```

- `PATCH /config` configures `election` with an `election.json` or `testMode`

- `POST /scan/invalidateBatch` invalidates a batch

  - `batchId`

- `POST /scan/scanBatch` scans a batch of ballots and stores them in the
  scanner's database

- `POST /scan/export` return all the CVRs as an attachment

- `DELETE /scan/batch/:batchId` delete a batch by ID

- `POST /scan/zero` zero's all data but not the election config
