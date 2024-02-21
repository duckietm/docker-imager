## Nitro Imager with Node V19

Copy the content to example : /docker/nitro_imager

Change the /docker/nitro_imager/.env

Let say your content is (clothes & config) in :/var/www/XXX/XXX/XXX then change the path in the .env file
But if you host your CMS on a other server you can replace the absoulte path with url paths as well.

Example :
```env
API_HOST=imager
API_PORT=3030
IMAGER_PATH='/imaging'
AVATAR_SAVE_PATH=/src/saved_figure
AVATAR_ACTIONS_URL=/var/www/Gamedata/config/HabboAvatarActions.json
AVATAR_FIGUREDATA_URL=/var/www/Gamedata/config/FigureData.json
AVATAR_FIGUREMAP_URL=/var/www/Gamedata/config/FigureMap.json
AVATAR_EFFECTMAP_URL=/var/Gamedata/config/EffectMap.json
AVATAR_ASSET_URL=/var/www/Gamedata/clothes/%libname%.nitro
```
Next make the path avalibe in /docker/nitro_imager/docker-compose.yml

Example:

```yml
services:
  nodejs:
    container_name: imager
    build:
      context: ./
      target: imager
    volumes:
      - ./imager:/src
      - /var/www:/var/www # Path to your data
    command: sh -c "npm i && npm run build && npm run start" 
    tty: true
```

Now you can run : docker-compose up -d 

and this will build and make the imager avalible on port 3030

to use it use the following in nginx:

```
location /imaging/ {
        proxy_pass http://172.38.0.2:3030;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
```

* Don't forget your firewall not to allow access from outside.
* if you have nginx setup and the docker is running, you can test it by using the follwing URL : https://##YOUR DOMAIN##/imaging/?figure=ha-1003-88.lg-285-89.ch-3032-1334-109.sh-3016-110.hd-180-1359.ca-3225-110-62.wa-3264-62-62.hr-891-1342.0;action=std&gesture=sml&direction=2&head_direction=2amp;img_format=png&gesture=srp&headonly=1&size=l
* Once the docker has run for the first time change the docker-compose.yml
```
command: sh -c "npm i && npm run build && npm run start"
```
Change this to:
```
command: sh -c "npm run start"
```
This will speedup the startup of the imager, as the Install/Build only need to be done once !
