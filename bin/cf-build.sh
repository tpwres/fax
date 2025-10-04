#! /bin/bash
# set -x

install_zola() {
	asdf plugin add zola https://github.com/salasrod/asdf-zola
	asdf install zola 0.20.0
	asdf global zola 0.20.0
}

create_config() {
  case $CF_PAGES_BRANCH in
      main)
          export BASE_URL=$PRODUCTION_URL
          ;;
      *)
          export BASE_URL=$CF_PAGES_URL
          ;;
  esac

  envsubst < cloudflare-config.toml > build_cloudflare_config.toml
}



build() {
  zola -c build_cloudflare_config.toml build
}

install_zola
create_config
build
