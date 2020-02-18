import EVENTS from "../events.js"
import external from "../externalModules.js"
import mouseButtonTool from "./mouseButtonTool.js"
import touchTool from "./touchTool.js"
import toolStyle from "../stateManagement/toolStyle.js"
import toolCoordinates from "../stateManagement/toolCoordinates.js"
import handleActivator from "../manipulators/handleActivator.js"
import toolColors from "../stateManagement/toolColors.js"
import drawHandles from "../manipulators/drawHandles.js"
import getHandleNearImagePoint from "../manipulators/getHandleNearImagePoint.js"
import pointInRotatedEllipse from "../util/pointInRotatedEllipse.js"
import calculateEllipseStatistics from "../util/calculateEllipseStatistics.js"
import isMouseButtonEnabled from "../util/isMouseButtonEnabled.js"
import calculateSUV from "../util/calculateSUV.js"
import triggerMeasurementCompletedEvent from "../util/triggerMeasurementCompletedEvent.js"
import drawLinkedTextBox from "../util/drawLinkedTextBox.js"
import moveNewHandle from "../manipulators/moveNewHandle.js"
import moveAllHandles from "../manipulators/moveAllHandles.js"
import anyHandlesOutsideImage from "../manipulators/anyHandlesOutsideImage.js"
import movePerpendicularHandle from "../manipulators/movePerpendicularHandle.js"
import { getToolOptions, setToolOptions } from "../toolOptions.js"
import {
  getToolState,
  removeToolState,
  addToolState
} from "../stateManagement/toolState.js"
import {
  drawRotatedEllipse,
  getNewContext,
  draw,
  setShadow
} from "../util/drawing.js"
import getColRowPixelSpacing from "../util/getColRowPixelSpacing.js"

const toolType = "rotatedEllipticalRoi"

// /////// BEGIN ACTIVE TOOL ///////
function addNewMeasurement(mouseEventData) {
  const element = mouseEventData.element
  const measurementData = createNewMeasurement(mouseEventData)

  const doneCallback = () => {
    measurementData.active = false
    external.cornerstone.updateImage(element)
  }

  addToolState(element, toolType, measurementData)
  external.cornerstone.updateImage(element)

  moveNewHandle(
    mouseEventData,
    toolType,
    measurementData,
    measurementData.handles.end,
    () => {
      if (anyHandlesOutsideImage(mouseEventData, measurementData.handles)) {
        // Delete the measurement
        removeToolState(element, toolType, measurementData)
      } else {
        const center = getCenter(measurementData.handles)
        measurementData.handles.perpendicularPoint.x = center.x
        measurementData.handles.perpendicularPoint.y = center.y
        measurementData.handles.perpendicularPoint.isFirst = false
        onHandleDoneMove(element, measurementData)
      }
    }
  )
}

function createNewMeasurement(mouseEventData) {
  // Create the measurement data for this tool with the end handle activated
  const measurementData = {
    visible: true,
    active: true,
    invalidated: true,
    color: undefined,
    shortestDistance: 0,
    handles: {
      start: {
        x: mouseEventData.currentPoints.image.x,
        y: mouseEventData.currentPoints.image.y,
        highlight: true,
        active: false,
        key: "start"
      },
      end: {
        x: mouseEventData.currentPoints.image.x,
        y: mouseEventData.currentPoints.image.y,
        highlight: true,
        active: true,
        key: "end"
      },
      perpendicularPoint: {
        x: mouseEventData.currentPoints.image.x,
        y: mouseEventData.currentPoints.image.y,
        highlight: true,
        active: true,
        isFirst: true,
        key: "perpendicular"
      },
      textBox: {
        active: false,
        hasMoved: false,
        movesIndependently: false,
        drawnIndependently: true,
        allowedOutsideImage: true,
        hasBoundingBox: true
      }
    }
  }

  return measurementData
}
// /////// END ACTIVE TOOL ///////

// /////// BEGIN IMAGE RENDERING ///////
function pointNearEllipse(element, data, coords, distance) {
  if (data.visible === false) {
    return false
  }

  const cornerstone = external.cornerstone
  const center = getCenter(data.handles)
  const startCanvas = cornerstone.pixelToCanvas(element, data.handles.start)
  const endCanvas = cornerstone.pixelToCanvas(element, data.handles.end)
  const perpendicularCanvas = cornerstone.pixelToCanvas(
    element,
    data.handles.perpendicularPoint
  )
  const centerCanvas = cornerstone.pixelToCanvas(element, center)

  const square = x => x * x
  const minorEllipse = {
    xRadius:
      Math.sqrt(
        square(startCanvas.x - endCanvas.x) +
          square(startCanvas.y - endCanvas.y)
      ) /
        2 -
      distance / 2,
    yRadius:
      Math.sqrt(
        square(perpendicularCanvas.x - centerCanvas.x) +
          square(perpendicularCanvas.y - centerCanvas.y)
      ) -
      distance / 2
  }

  const majorEllipse = {
    xRadius:
      Math.sqrt(
        square(startCanvas.x - endCanvas.x) +
          square(startCanvas.y - endCanvas.y)
      ) /
        2 +
      distance / 2,
    yRadius:
      Math.sqrt(
        square(perpendicularCanvas.x - centerCanvas.x) +
          square(perpendicularCanvas.y - centerCanvas.y)
      ) +
      distance / 2
  }
  const theta = Math.atan2(
    endCanvas.y - startCanvas.y,
    endCanvas.x - startCanvas.x
  )

  const pointInMinorEllipse = pointInRotatedEllipse(
    minorEllipse,
    centerCanvas,
    coords,
    theta
  )
  const pointInMajorEllipse = pointInRotatedEllipse(
    majorEllipse,
    centerCanvas,
    coords,
    theta
  )

  if (pointInMajorEllipse) {
    return true
  }

  return false
}

function pointNearTool(element, data, coords) {
  return pointNearEllipse(element, data, coords, 15)
}

function pointNearToolTouch(element, data, coords) {
  return pointNearEllipse(element, data, coords, 25)
}

function numberWithCommas(x) {
  // http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
  const parts = x.toString().split(".")

  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  return parts.join(".")
}

function getCenter(handles) {
  const { start, end } = handles
  const w = Math.abs(start.x - end.x)
  const h = Math.abs(start.y - end.y)
  const xMin = Math.min(start.x, end.x)
  const yMin = Math.min(start.y, end.y)

  let center = {
    x: xMin + w / 2,
    y: yMin + h / 2
  }
  return center
}

function mouseMoveCallback(e) {
  const eventData = e.detail

  toolCoordinates.setCoords(eventData)

  // If we have no tool data for this element, do nothing
  const toolData = getToolState(eventData.element, toolType)

  if (!toolData) {
    return
  }

  // We have tool data, search through all data
  // And see if we can activate a handle
  let imageNeedsUpdate = false

  for (let i = 0; i < toolData.data.length; i++) {
    // Get the cursor position in canvas coordinates
    const coords = eventData.currentPoints.canvas

    const data = toolData.data[i]

    if (handleActivator(eventData.element, data.handles, coords) === true) {
      imageNeedsUpdate = true
    }

    if (
      (pointNearTool(eventData.element, data, coords) && !data.active) ||
      (!pointNearTool(eventData.element, data, coords) && data.active)
    ) {
      data.active = !data.active
      imageNeedsUpdate = true
    }
  }

  // Handle activation status changed, redraw the image
  if (imageNeedsUpdate === true) {
    external.cornerstone.updateImage(eventData.element)
  }
}

function mouseDownCallback(e) {
  const eventData = e.detail
  let data
  const element = eventData.element
  const options = getToolOptions(toolType, element)

  if (!isMouseButtonEnabled(eventData.which, options.mouseButtonMask)) {
    return
  }

  function handleDoneMove() {
    data.invalidated = true
    if (anyHandlesOutsideImage(eventData, data.handles)) {
      // Delete the measurement
      removeToolState(element, toolType, data)
    } else if (onHandleDoneMove) {
      onHandleDoneMove(element, data)
    }

    external.cornerstone.updateImage(element)
    element.addEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback)
  }

  const coords = eventData.startPoints.canvas
  const toolData = getToolState(e.currentTarget, toolType)

  if (!toolData) {
    return
  }

  let i

  // Now check to see if there is a handle we can move

  let preventHandleOutsideImage = true

  for (i = 0; i < toolData.data.length; i++) {
    data = toolData.data[i]
    const distance = 6
    const handle = getHandleNearImagePoint(
      element,
      data.handles,
      coords,
      distance
    )

    if (handle) {
      element.removeEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback)
      data.active = true
      movePerpendicularHandle(
        eventData,
        toolType,
        data,
        handle,
        handleDoneMove,
        preventHandleOutsideImage
      )
      e.stopImmediatePropagation()
      e.stopPropagation()
      e.preventDefault()

      return
    }
  }

  // Now check to see if there is a line we can move
  // Now check to see if we have a tool that we can move
  if (!pointNearTool) {
    return
  }

  const opt = {
    deleteIfHandleOutsideImage: true,
    preventHandleOutsideImage: false
  }

  for (i = 0; i < toolData.data.length; i++) {
    data = toolData.data[i]
    data.active = false
    if (pointNearTool(element, data, coords)) {
      data.active = true
      element.removeEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback)
      moveAllHandles(e, data, toolData, toolType, opt, handleDoneMove)
      e.stopImmediatePropagation()
      e.stopPropagation()
      e.preventDefault()

      return
    }
  }
}

function onImageRendered(e) {
  const eventData = e.detail

  // If we have no toolData for this element, return immediately as there is nothing to do
  const toolData = getToolState(e.currentTarget, toolType)

  if (!toolData) {
    return
  }

  const cornerstone = external.cornerstone
  const image = eventData.image
  const element = eventData.element
  const lineWidth = toolStyle.getToolWidth()
  const config = rotatedEllipticalRoi.getConfiguration()
  const seriesModule = cornerstone.metaData.get(
    "generalSeriesModule",
    image.imageId
  )
  let modality
  const { rowPixelSpacing, colPixelSpacing } = getColRowPixelSpacing(
    eventData.image
  )

  if (seriesModule) {
    modality = seriesModule.modality
  }

  const context = getNewContext(eventData.canvasContext.canvas)

  // If we have tool data for this element - iterate over each set and draw it
  for (let i = 0; i < toolData.data.length; i++) {
    const data = toolData.data[i]

    if (data.visible === false) {
      continue
    }

    draw(context, context => {
      // Apply any shadow settings defined in the tool configuration
      setShadow(context, config)

      // Check which color the rendered tool should be
      const color = toolColors.getColorIfActive(data)
      // getIntersection(data.handles)
      // console.log(getIntersection(data.handles))
      // Draw the ellipse on the canvas
      drawRotatedEllipse(
        context,
        element,
        data.handles.start,
        data.handles.end,
        data.handles.perpendicularPoint,
        {
          color
        }
      )

      // If the tool configuration specifies to only draw the handles on hover / active,
      // Follow this logic
      if (config && config.drawHandlesOnHover) {
        // Draw the handles if the tool is active
        if (data.active === true) {
          drawHandles(context, eventData, data.handles, color)
        } else {
          // If the tool is inactive, draw the handles only if each specific handle is being
          // Hovered over
          const handleOptions = {
            drawHandlesIfActive: true
          }

          drawHandles(context, eventData, data.handles, color, handleOptions)
        }
      } else {
        // If the tool has no configuration settings, always draw the handles
        drawHandles(context, eventData, data.handles, color)
      }

      calculateStatistics(
        data,
        element,
        image,
        modality,
        rowPixelSpacing,
        colPixelSpacing
      )

      // If the textbox has not been moved by the user, it should be displayed on the right-most
      // Side of the tool.
      if (!data.handles.textBox.hasMoved) {
        // Find the rightmost side of the ellipse at its vertical center, and place the textbox here
        // Note that this calculates it in image coordinates
        data.handles.textBox.x = Math.max(
          data.handles.start.x,
          data.handles.end.x
        )
        data.handles.textBox.y = (data.handles.start.y + data.handles.end.y) / 2
      }

      const text = textBoxText(data)

      drawLinkedTextBox(
        context,
        element,
        data.handles.textBox,
        text,
        data.handles,
        textBoxAnchorPoints,
        color,
        lineWidth,
        0,
        true
      )
    })
  }

  function textBoxText(data) {
    const { meanStdDev, meanStdDevSUV, area, extra } = data

    // Define an array to store the rows of text for the textbox
    const textLines = []

    // If the mean and standard deviation values are present, display them
    if (meanStdDev && meanStdDev.mean !== undefined) {
      // If the modality is CT, add HU to denote Hounsfield Units
      let moSuffix = ""

      if (modality === "CT") {
        moSuffix = " HU"
      }

      // Create a line of text to display the mean and any units that were specified (i.e. HU)
      let meanText = `Mean: ${numberWithCommas(
        meanStdDev.mean.toFixed(2)
      )}${moSuffix}`
      // Create a line of text to display the standard deviation and any units that were specified (i.e. HU)
      let stdDevText = `StdDev: ${numberWithCommas(
        meanStdDev.stdDev.toFixed(2)
      )}${moSuffix}`

      // If this image has SUV values to display, concatenate them to the text line
      if (meanStdDevSUV && meanStdDevSUV.mean !== undefined) {
        const SUVtext = " SUV: "

        meanText += SUVtext + numberWithCommas(meanStdDevSUV.mean.toFixed(2))
        stdDevText +=
          SUVtext + numberWithCommas(meanStdDevSUV.stdDev.toFixed(2))
      }

      // Add these text lines to the array to be displayed in the textbox
      textLines.push(meanText)
      textLines.push(stdDevText)
    }

    // If the area is a sane value, display it
    if (area) {
      // Determine the area suffix based on the pixel spacing in the image.
      // If pixel spacing is present, use millimeters. Otherwise, use pixels.
      // This uses Char code 178 for a superscript 2
      let suffix = ` mm${String.fromCharCode(178)}`

      if (!rowPixelSpacing || !colPixelSpacing) {
        suffix = ` pixels${String.fromCharCode(178)}`
      }

      // Create a line of text to display the area and its units
      const areaText = `Area: ${numberWithCommas(area.toFixed(2))}${suffix}`

      // Add this text line to the array to be displayed in the textbox
      textLines.push(areaText)
    }

    if (extra) {
      textLines.push(extra)
    }

    return extra ? [extra] : []
    // return textLines
  }

  function textBoxAnchorPoints(handles) {
    // Retrieve the bounds of the ellipse (left, top, width, and height)
    const left = Math.min(handles.start.x, handles.end.x)
    const top = Math.min(handles.start.y, handles.end.y)
    const width = Math.abs(handles.start.x - handles.end.x)
    const height = Math.abs(handles.start.y - handles.end.y)

    return [
      {
        x: handles.start.x,
        y: handles.start.y
      },
      {
        x: handles.end.x,
        y: handles.end.y
      },
      {
        x: handles.perpendicularPoint.x,
        y: handles.perpendicularPoint.y
      }
    ]
  }
}
// /////// END IMAGE RENDERING ///////

function calculateStatistics(
  data,
  element,
  image,
  modality,
  rowPixelSpacing,
  colPixelSpacing
) {
  const cornerstone = external.cornerstone
  // Define variables for the area and mean/standard deviation
  let area, meanStdDev, meanStdDevSUV

  // Perform a check to see if the tool has been invalidated. This is to prevent
  // Unnecessary re-calculation of the area, mean, and standard deviation if the
  // Image is re-rendered but the tool has not moved (e.g. during a zoom)
  if (data.invalidated === false) {
    // If the data is not invalidated, retrieve it from the toolData
    meanStdDev = data.meanStdDev
    meanStdDevSUV = data.meanStdDevSUV
    area = data.area
  } else {
    // If the data has been invalidated, we need to calculate it again

    // Retrieve the bounds of the ellipse in image coordinates
    const ellipse = {
      left: Math.round(Math.min(data.handles.start.x, data.handles.end.x)),
      top: Math.round(Math.min(data.handles.start.y, data.handles.end.y)),
      width: Math.round(Math.abs(data.handles.start.x - data.handles.end.x)),
      height: Math.round(Math.abs(data.handles.start.y - data.handles.end.y))
    }

    // First, make sure this is not a color image, since no mean / standard
    // Deviation will be calculated for color images.
    if (!image.color) {
      // Retrieve the array of pixels that the ellipse bounds cover
      const pixels = cornerstone.getPixels(
        element,
        ellipse.left,
        ellipse.top,
        ellipse.width,
        ellipse.height
      )

      // Calculate the mean & standard deviation from the pixels and the ellipse details
      meanStdDev = calculateEllipseStatistics(pixels, ellipse)

      if (modality === "PT") {
        // If the image is from a PET scan, use the DICOM tags to
        // Calculate the SUV from the mean and standard deviation.

        // Note that because we are using modality pixel values from getPixels, and
        // The calculateSUV routine also rescales to modality pixel values, we are first
        // Returning the values to storedPixel values before calcuating SUV with them.
        // TODO: Clean this up? Should we add an option to not scale in calculateSUV?
        meanStdDevSUV = {
          mean: calculateSUV(
            image,
            (meanStdDev.mean - image.intercept) / image.slope
          ),
          stdDev: calculateSUV(
            image,
            (meanStdDev.stdDev - image.intercept) / image.slope
          )
        }
      }

      // If the mean and standard deviation values are sane, store them for later retrieval
      if (meanStdDev && !isNaN(meanStdDev.mean)) {
        data.meanStdDev = meanStdDev
        data.meanStdDevSUV = meanStdDevSUV
      }
    }

    // Calculate the image area from the ellipse dimensions and pixel spacing
    area =
      Math.PI *
      ((ellipse.width * (colPixelSpacing || 1)) / 2) *
      ((ellipse.height * (rowPixelSpacing || 1)) / 2)

    // If the area value is sane, store it for later retrieval
    if (!isNaN(area)) {
      data.area = area

      data.unit = `mm${String.fromCharCode(178)}`
      if (!rowPixelSpacing || !colPixelSpacing) {
        data.unit = `pixels${String.fromCharCode(178)}`
      }
    }

    // Set the invalidated flag to false so that this data won't automatically be recalculated
    data.invalidated = false
  }
}

function onHandleDoneMove(element, data) {
  const image = external.cornerstone.getImage(element)
  const seriesModule = external.cornerstone.metaData.get(
    "generalSeriesModule",
    image.imageId
  )
  let modality
  const { rowPixelSpacing, colPixelSpacing } = getColRowPixelSpacing(image)

  if (seriesModule) {
    modality = seriesModule.modality
  }

  calculateStatistics(
    data,
    element,
    image,
    modality,
    rowPixelSpacing,
    colPixelSpacing
  )

  triggerMeasurementCompletedEvent(element, data, toolType)
}

// Module exports
const rotatedEllipticalRoi = mouseButtonTool({
  createNewMeasurement,
  onImageRendered,
  pointNearTool,
  toolType,
  onHandleDoneMove,
  addNewMeasurement,
  mouseDownCallback
})

const rotatedEllipticalRoiTouch = touchTool({
  createNewMeasurement,
  onImageRendered,
  pointNearTool: pointNearToolTouch,
  toolType,
  onHandleDoneMove
})

export { rotatedEllipticalRoi, rotatedEllipticalRoiTouch }
