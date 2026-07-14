#!/bin/bash
IMAGE_PARTS_PATH="${10}"
LOCKFILE="${11}"
WORKER_ID="${12}"

# Create unique temp dir per worker to avoid filename conflicts
TMPDIR=/tmp/${WORKER_ID}
mkdir -p $TMPDIR

if [ $1 -eq 1 ] ; then
  povray -D $2$3 $4 $5 $6 +O${TMPDIR}/ 1>/dev/null 2>${TMPDIR}/povraymessages
elif [ $1 -gt 1 ] ; then
  povray -D $2$3 $4 $5 $6 $7 $8 $9 +O${TMPDIR}/ 1>/dev/null 2>${TMPDIR}/povraymessages
  SIZE_TEMP=`echo $8 | cut -c 4-`
  SIZE_RESULT=`expr $SIZE_TEMP - 1`
  IMG_HEIGHT=`echo $6 | cut -c 3-`
  IMG_WIDTH=`echo $5 | cut -c 3-`
  ROW_SIZE=`expr ${IMG_HEIGHT} / ${1}`
  convert -set colorspace RGB -extract ${IMG_WIDTH}x${ROW_SIZE}+0+${SIZE_RESULT} +repage \
    ${TMPDIR}/`echo $3 | cut -f1 -d'.'`.png \
    ${TMPDIR}/`echo $3 | cut -f1 -d'.'`.png
else
  echo "An error occurred." && exit 1
fi

mv ${TMPDIR}/$(echo $3 | cut -f1 -d'.').png "${IMAGE_PARTS_PATH}/${WORKER_ID}.png"
rm -rf ${TMPDIR}

DONE_ENTRY="${WORKER_ID} $(hostname) $(date +%Y_%m_%d_%H:%M:%S)"
echo "$DONE_ENTRY" > "${IMAGE_PARTS_PATH}/${WORKER_ID}.done"
echo "$DONE_ENTRY" >> "$LOCKFILE"