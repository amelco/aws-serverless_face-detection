'use strict';

const AWS = require('aws-sdk');             // para acessar os serviços AWS
const sharp = require('sharp');             // para cortar e redimensionar a imagem
const { basename, extname } = require('path');  // pega funcoes para retornar o nome do afrquivo e sua extensao d abiblioteca path do NOdejs
const rekognition = new AWS.Rekognition();  // para utilizar o rekognition
const s3 = new AWS.S3();                    // para remover e adicionar imagens no bucket

module.exports.faceDetection = async event => {
  const s3Record = event.Records[0].s3;
  const bucket   = s3Record.bucket.name;
  const key      = s3Record.object.key;

  //console.log(`Arquivo ${key} adicionado no bucket ${bucket}`)

  // detectar faces
  return checkForFaces(bucket, key).then(data => {
    const faceDetails = data.FaceDetails;
    console.log("Detlahes da face: ", faceDetails);

    // apagar imagem caso não haja faces
    if (typeof faceDetails === "undefined" || faceDetails.length === 0 ) {
      return removeImage(bucket, key).then(() => {
        console.log("Não há faces! Imagem removida.");
        return;
      });
    }
    
    // armazena o blob da imagem num objeto
    return s3.getObject({  // imagem
      Bucket: bucket,
      Key: key,
    }).promise().then(data => {
      
      // Loop em todas a faces

      //console.log(data);
      // pega as dimensoes do bounding box
      const {Height: bHeight, Left: bLeft, Top: bTop, Width: bWidth} = faceDetails[0].BoundingBox;
      //console.log("Bounding Box: ", faceDetails[0].BoundingBox);
      return sharp(data.Body)
        .metadata().then(({ width, height }) => {
          const coords = { width: bWidth*width | 0, height: bHeight*height | 0, left: bLeft*width | 0, top: bTop*height | 0 };
          console.log("Coords: ", coords);
          sharp(data.Body)
          .extract(coords)
          .resize(100, 100, { fit: 'inside', withoutEnlargement: true })     // redimensiona para no maximo 100 larg ou 100 de altura sem perder proporção
          .toFormat('jpeg', { progressive: true, quality: 50 })
          .toBuffer()
          .then(result => {
            //console.log(result);
            return s3.putObject({
              Body: result,
              Bucket: bucket,
              ContentType: 'image/jpeg',
              Key: `thumbnail/thumb_${basename(key, extname(key))}.jpg`  // nome do arquivo substituindo extensão original por jpg
            }).promise().then(res => {
              //console.log("Thumbnail Gravada com sucesso ", res);
              return res;
            }).catch((e => {
              console.log("Erro salvando thumbnail", e);
              return e;
            }))
          }).catch(er => {
            console.log("Erro no sharp", er);
            return er;
          })
        }).catch(fail => {
          console.log("Erro pegando dimensões da imagem ", fail);
          return fail;
        })

    // fim do loop das faces
    }).catch(err => {
      console.log("Erro gerando blob", err);
      return err;
    })
  }).catch(error => {
    console.log("Erro checando faces", error);
  });
};

function checkForFaces(bucket, key) {
  const params = {
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: key
      }
    }
  };

  return rekognition.detectFaces(params).promise().then(data => {
    return data;
  }).catch(error => {
    return error;
  });
}

function removeImage(bucket, key) {
  const params = {
    Bucket: bucket,
    Key: key
  };

  return s3.deleteObject(params).promise();
}

