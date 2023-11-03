docker build . -t popt_mint_server
docker stop popt_mint_server_container
docker rm popt_mint_server_container
docker run --network=host --name popt_mint_server_container -p 49160:3005 -d popt_mint_server
