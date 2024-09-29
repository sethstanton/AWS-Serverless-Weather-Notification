'use strict';

const AWS = require('aws-sdk');
const axios = require('axios');
const nodemailer = require('nodemailer');

const dynamo = new AWS.DynamoDB.DocumentClient();

module.exports.subscribe = async (event) => {
  const data = JSON.parse(event.body);
  const { email, location } = data;

  if (!email || !location) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Email and location are required.' }),
    };
  }

  const params = {
    TableName: 'Subscriptions',
    Item: {
      email,
      location,
    },
  };

  try {
    await dynamo.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Subscription successful.' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to subscribe.', error: error.message }),
    };
  }
};


module.exports.sendWeatherNotifications = async (event) => {
  const params = {
    TableName: 'Subscriptions',
  };

  let subscriptions;
  try {
    const data = await dynamo.scan(params).promise();
    subscriptions = data.Items;
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to fetch subscriptions.', error: error.message }),
    };
  }

  const transporter = nodemailer.createTransport({
    SES: new AWS.SES({ region: process.env.AWS_REGION }),
  });

  for (const subscriber of subscriptions) {
    const { email, location } = subscriber;

    const weatherUrl = `http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      location
    )}&appid=${process.env.WEATHER_API_KEY}&units=metric`;

    let weatherData;
    try {
      const response = await axios.get(weatherUrl);
      weatherData = response.data;
    } catch (error) {
      console.error(`Error fetching weather for ${location}:`, error);
      continue;
    }

    const weatherDescription = weatherData.weather[0].description;
    const temperature = weatherData.main.temp;
    const message = `Good morning!\n\nToday's weather in ${location}:\n- ${weatherDescription}\n- Temperature: ${temperature}°C\n\nHave a great day!`;

    const mailOptions = {
      from: process.env.SES_EMAIL,
      to: email,
      subject: `Daily Weather Update for ${location}`,
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}`);
    } catch (error) {
      console.error(`Error sending email to ${email}:`, error);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Weather notifications sent.' }),
  };
};
