TIMESTAMP := $(shell date --iso-8601=seconds --utc | sed 's/+.*$\//g' | tr ':' '-')

# a phony dependency that can be used as a dependency to force builds
FORCE:

install: install-base install-custom

install-base:
	sudo apt install -y build-essential libx11-dev libjpeg-dev libpng-dev

install-custom:
	./vendor/setup-zbarimg

build: FORCE
	yarn install

run:
	yarn start

debug-dump:
	git rev-parse HEAD > REVISION
	zip -r debug-dump-$(TIMESTAMP).zip REVISION tmp *.db *.db.digest
	rm REVISION
	@echo "Debug info dumped to debug-dump-$(TIMESTAMP).zip"
